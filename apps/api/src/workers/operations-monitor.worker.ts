import { Pool, type PoolClient } from "pg";
import { Redis } from "ioredis";
import { hostname } from "node:os";
import { env } from "../config/env";
import { readMonitorConfig } from "../modules/operations/monitor-config";
import { monitoredQueueNames, resolveRedisFeatures } from "../modules/operations/redis-features";
import { QueueSampler } from "../modules/operations/queue-sampler";
import { emptyMonitorDocument, sampleMonitor, type MonitorDocument } from "../modules/operations/operations-monitor";
import { flushAlerts, sendAlert } from "../modules/operations/alert-delivery";

async function main() {
  const config = readMonitorConfig();
  const features = resolveRedisFeatures({ ...process.env, ...env });
  const names = monitoredQueueNames(features, env.NODE_ENV === "integration" ? process.env.AUTOMATION_QUEUE_NAME : undefined, env.NODE_ENV === "integration" ? process.env.REMINDER_QUEUE_NAME : undefined);
  const connection = new Redis(env.REDIS_URL, { lazyConnect: names.length === 0, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2000, commandTimeout: 2500 });
  connection.on("error", () => {});
  const sampler = new QueueSampler(connection, config.OPERATIONS_ENVIRONMENT, config.OPERATIONS_STALE_MS);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 2500, statement_timeout: 2500 });
  pool.on("error", () => {});
  let lease: PoolClient | null = null;
  let document = emptyMonitorDocument(Math.max(60000, config.OPERATIONS_POLL_MS * 4));
  let sampled = false; let stopping = false; let active: Promise<void> | null = null;
  let lastPersistFailed = false;
  const releaseLease = () => { const old = lease; lease = null; old?.release(true); };
  async function databaseLease(): Promise<"owned" | "other" | "unavailable"> {
    try {
      if (!lease) {
        const client = await pool.connect();
        try {
          const result = await client.query("SELECT pg_try_advisory_lock(20481029) AS acquired");
          if (!result.rows[0].acquired) { client.release(); return "other"; }
          lease = client;
          client.on("error", () => { if (lease === client) releaseLease(); });
        } catch (error) { client.release(true); throw error; }
      }
      const existing = await lease.query("SELECT value FROM operations_monitor_states WHERE key='main'");
      if (!sampled && existing.rows[0]) document = existing.rows[0].value as MonitorDocument;
      return "owned";
    } catch { releaseLease(); return "unavailable"; }
  }
  const persist = async () => {
    if (!lease) return false;
    try {
      await lease.query("INSERT INTO operations_monitor_states(key,value,updated_at) VALUES('main',$1,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()", [document]);
      lastPersistFailed = false;
      return true;
    } catch { lastPersistFailed = true; releaseLease(); return false; }
  };
  const tick = async () => {
    const database = await databaseLease();
    if (database === "other") return;
    const priorEvents = new Set(document.alerts.history.map(event => event.id));
    document = await sampleMonitor(document, { names, databaseReady: database === "owned" && !lastPersistFailed, ping: () => connection.ping(), sample: (name, previous, now) => sampler.sample(name, previous, now), config });
    document.staleAfterMs = Math.max(60000, config.OPERATIONS_POLL_MS * 4);
    document.producer = { host: hostname(), commit: process.env.RELEASE_COMMIT ?? "development" };
    sampled = true;
    for (const event of document.alerts.history) if (!priorEvents.has(event.id)) console.log(JSON.stringify({ event: "operations_alert", ...event }));
    // Persist pending event before delivery. Stable IDs allow receiver-side deduplication after a crash.
    await persist();
    await flushAlerts(document.alerts, event => sendAlert(event, { url: config.OPERATIONS_ALERT_WEBHOOK_URL, token: config.OPERATIONS_ALERT_WEBHOOK_TOKEN }));
    await persist();
  };
  const run = () => {
    if (active || stopping) return;
    active = tick().catch(() => console.error(JSON.stringify({ event: "operations_monitor_cycle_failed" }))).finally(() => { active = null; });
  };
  run(); const timer = setInterval(run, config.OPERATIONS_POLL_MS);
  const shutdown = async () => {
    if (stopping) return; stopping = true; clearInterval(timer); await active;
    releaseLease(); connection.disconnect(); await sampler.close(); await pool.end();
  };
  process.on("SIGTERM", () => void shutdown()); process.on("SIGINT", () => void shutdown());
  console.log(JSON.stringify({ event: "operations_monitor_started", environment: config.OPERATIONS_ENVIRONMENT, queues: names }));
}
void main().catch(() => { console.error(JSON.stringify({ event: "operations_monitor_startup_failed" })); process.exitCode = 1; });
