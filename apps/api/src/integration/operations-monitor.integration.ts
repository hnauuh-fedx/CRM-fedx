import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { Redis } from "ioredis";
import { Queue, Worker } from "bullmq";
import "dotenv/config";
import type { MonitorDocument } from "../modules/operations/operations-monitor";
import { checkReadiness } from "../modules/operations/readiness";

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("Operations integration requires local PostgreSQL.");
  const suffix = Date.now(); const database = `crm_ops_test_${suffix}`; const container = `crm-ops-test-${suffix}`;
  const adminUrl = new URL(target); adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect(); await admin.query(`CREATE DATABASE "${database}"`);
  target.pathname = `/${database}`;
  const db = new Client({ connectionString: target.toString() }); await db.connect();
  const events: Array<{ eventId: string; condition: string; state: string }> = [];
  const receiver = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    assert.ok(!body.includes("DO_NOT_LEAK"));
    events.push(JSON.parse(body)); res.writeHead(200); res.end("ok");
  });
  let monitor: ChildProcess | undefined; let redis: Redis | undefined; let commandRedis: Redis | undefined;
  const queues: Queue[] = []; const workers: Worker[] = [];
  let paused = false; let createdContainer = false; let releaseHung: (() => void) | undefined;
  const docker = (...args: string[]) => {
    const result = spawnSync("docker", args, { encoding: "utf8", timeout: 60000, windowsHide: true });
    if (result.status !== 0) throw new Error(`Docker command failed: ${args[0]}`);
    return result.stdout.trim();
  };
  const wait = async (predicate: () => Promise<boolean> | boolean, label: string, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    const diagnostic = (await db.query("SELECT value FROM operations_monitor_states WHERE key='main'")).rows[0]?.value;
    throw new Error(`Timed out: ${label}; snapshot=${JSON.stringify(diagnostic?.snapshot)}; events=${JSON.stringify(events)}`);
  };
  const snapshot = async (): Promise<MonitorDocument | undefined> => (await db.query("SELECT value FROM operations_monitor_states WHERE key='main'")).rows[0]?.value;
  const stopMonitor = async () => {
    const current = monitor; monitor = undefined;
    if (!current || current.exitCode !== null) return;
    const exited = once(current, "exit"); current.kill("SIGTERM");
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (current.exitCode === null) { current.kill("SIGKILL"); await exited; }
  };
  try {
    await db.query(await readFile(path.join(__dirname, "../../prisma/migrations/20261028110000_operations_monitor_state/migration.sql"), "utf8"));
    receiver.listen(0, "127.0.0.1"); await once(receiver, "listening");
    docker("run", "--rm", "-d", "--name", container, "-p", "127.0.0.1::6379", "redis:7-alpine"); createdContainer = true;
    const port = docker("port", container, "6379/tcp").split(":").at(-1);
    const redisUrl = `redis://127.0.0.1:${port}`;
    redis = new Redis(redisUrl, { maxRetriesPerRequest: null }); redis.on("error", () => {});
    commandRedis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false, commandTimeout: 1500 }); commandRedis.on("error", () => {});
    await redis.ping(); await commandRedis.ping();
    const environment = `test_${suffix}`; const base = `ops_${suffix}`;
    const names = [base, `${base}_bulk_prepare`, `${base}_bulk_lead`, `${base}_reassignment`];
    // Import heartbeat with test-mode global connections disabled; inject only the isolated Redis.
    process.env.NODE_ENV = "test";
    const { instrumentWorker } = await import("../modules/operations/worker-heartbeat.js");
    let failJobs = true;
    const makeWorker = async (name: string) => {
      const worker = new Worker(name, async job => {
        if (job.name === "fail" && failJobs) throw new Error("test failure");
        if (job.name === "hang") await new Promise<void>(resolve => { releaseHung = resolve; });
        return "ok";
      }, { connection: redis as never, concurrency: 1 });
      worker.on("error", () => {}); workers.push(worker); await worker.waitUntilReady();
      instrumentWorker(worker, { connection: commandRedis!, environment, intervalMs: 100, staleMs: 3000 });
      return worker;
    };
    for (const name of names) { const queue = new Queue(name, { connection: redis as never }); queue.on("error", () => {}); queues.push(queue); await makeWorker(name); }
    const startMonitor = () => {
      monitor = spawn(process.execPath, ["--import", "tsx", "src/workers/operations-monitor.worker.ts"], { cwd: path.join(__dirname, "../.."), windowsHide: true, stdio: "ignore", env: {
        ...process.env, NODE_ENV: "integration", DATABASE_URL: target.toString(), REDIS_URL: redisUrl,
        WEBHOOK_QUEUE_ENABLED: "false", DISABLE_AUTOMATION_WORKER: "false", ZALO_QUEUE_ENABLED: "false", META_QUEUE_ENABLED: "false", REMINDER_QUEUE_ENABLED: "false", AUTOMATION_QUEUE_NAME: base,
        OPERATIONS_ENVIRONMENT: environment, OPERATIONS_POLL_MS: "1000", OPERATIONS_HEARTBEAT_MS: "1000", OPERATIONS_STALE_MS: "3000", OPERATIONS_ALERT_AFTER_MS: "1000", OPERATIONS_RECOVERY_AFTER_MS: "1000",
        OPERATIONS_ALERT_WEBHOOK_URL: `http://127.0.0.1:${(receiver.address() as { port: number }).port}`,
        OPERATIONS_ALERT_WEBHOOK_TOKEN: "", OPERATIONS_QUEUE_THRESHOLDS: JSON.stringify({ [base]: { waitingCount: 1, failedCount: 1, waitingMs: 1000, activeMs: 1000, noProgressMs: 1000 } }),
      } });
    };
    startMonitor();
    await wait(async () => (await snapshot())?.snapshot.queues.every(queue => "liveWorkers" in queue && queue.liveWorkers >= 1) ?? false, "initial healthy workers");
    await queues[0].add("future", { secret: "DO_NOT_LEAK" }, { delay: 600000 });
    await wait(async () => { const queue = (await snapshot())?.snapshot.queues[0]; return Boolean(queue && "delayed" in queue && queue.delayed === 1 && queue.overdueDelayed === 0 && queue.waiting === 0); }, "future job excluded");
    assert.equal(events.some(event => event.condition === `queue:${base}:backlog`), false);
    await queues[0].pause();
    const overdue = await queues[0].add("overdue", { secret: "DO_NOT_LEAK" }, { delay: 600000 });
    await redis.zadd(queues[0].toKey("delayed"), (Date.now() - 2000) * 4096, overdue.id!);
    await queues[0].add("waiting", { secret: "DO_NOT_LEAK" });
    await wait(async () => { const queue = (await snapshot())?.snapshot.queues[0]; return Boolean(queue && "overdueDelayed" in queue && queue.overdueDelayed >= 1 && queue.waitingAgeMs >= 2000); }, "delayed due time observed correctly");
    await wait(() => events.some(event => event.condition === `queue:${base}:backlog` && event.state === "FIRING"), "backlog alert");
    await queues[0].resume();
    await wait(() => events.some(event => event.condition === `queue:${base}:backlog` && event.state === "RESOLVED"), "backlog recovery");
    const failed = await queues[0].add("fail", { secret: "DO_NOT_LEAK" }, { attempts: 1 });
    await wait(() => events.some(event => event.condition === `queue:${base}:failed` && event.state === "FIRING"), "failure alert");
    failJobs = false; await failed.retry();
    await wait(() => events.some(event => event.condition === `queue:${base}:failed` && event.state === "RESOLVED"), "failure recovery");
    await queues[0].add("hang", {});
    await wait(() => events.some(event => event.condition === `queue:${base}:active` && event.state === "FIRING"), "healthy-heartbeat stuck worker alert");
    assert.ok(releaseHung); releaseHung(); releaseHung = undefined;
    await wait(() => events.some(event => event.condition === `queue:${base}:active` && event.state === "RESOLVED"), "stuck job recovery");
    await workers[0].close();
    const missingKey = `queue:${base}:worker`;
    const beforeMissing = events.filter(event => event.condition === missingKey && event.state === "FIRING").length;
    await wait(() => events.filter(event => event.condition === missingKey && event.state === "FIRING").length > beforeMissing, "worker loss alert");
    await wait(async () => (await snapshot())?.alerts.pending.length === 0, "delivery acknowledgement persisted");
    const countBeforeRestart = events.filter(event => event.condition === missingKey && event.state === "FIRING").length;
    await stopMonitor(); startMonitor();
    await new Promise(resolve => setTimeout(resolve, 2500));
    assert.equal(events.filter(event => event.condition === missingKey && event.state === "FIRING").length, countBeforeRestart);
    await makeWorker(base);
    await wait(async () => (await snapshot())?.alerts.incidents[missingKey]?.active === false, "worker recovery");
    docker("pause", container); paused = true;
    assert.equal(await checkReadiness({ database: () => db.query("SELECT 1"), redis: () => commandRedis!.ping(), features: { webhook: false, automation: true, zalo: false, meta: false, reminders: false } }), false);
    await wait(() => events.some(event => event.condition === "redis" && event.state === "FIRING"), "Redis outage delivered without Redis", 20000);
    docker("unpause", container); paused = false;
    await wait(() => events.some(event => event.condition === "redis" && event.state === "RESOLVED"), "Redis recovery", 20000);
    assert.equal(await checkReadiness({ database: () => db.query("SELECT 1"), redis: () => commandRedis!.ping(), features: { webhook: false, automation: true, zalo: false, meta: false, reminders: false } }), true);
    console.log("PASS: isolated real Redis/PostgreSQL, future jobs, backlog, failed jobs, stuck processing with healthy heartbeat, lost worker, persistent dedup after monitor restart, Redis outage/recovery via independent HTTP receiver; no job payload leakage.");
  } finally {
    if (paused && createdContainer) docker("unpause", container);
    releaseHung?.(); await stopMonitor();
    await Promise.allSettled(workers.map(worker => worker.close(true)));
    await Promise.allSettled(queues.map(queue => queue.close()));
    redis?.disconnect(); commandRedis?.disconnect();
    if (receiver.listening) await new Promise<void>(resolve => receiver.close(() => resolve()));
    await db.end();
    if (createdContainer && /^crm-ops-test-\d+$/.test(container)) docker("rm", "-f", container);
    if (!/^crm_ops_test_\d+$/.test(database) || target.pathname !== `/${database}`) throw new Error("Unsafe test database cleanup target");
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [database]);
    await admin.query(`DROP DATABASE "${database}"`); await admin.end();
  }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
