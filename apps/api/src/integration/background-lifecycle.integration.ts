import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "../database/prisma";
import { Client } from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/crm_manual_unassign_test_\d+$/, "Run using the isolated test runner");
  const suffix = Date.now(); const container = `crm-background-test-${suffix}`;
  const children: ChildProcess[] = []; const queues: Queue[] = [];
  let redis: Redis | undefined; let created = false;
  const docker = (...args: string[]) => {
    const result = spawnSync("docker", args, { encoding: "utf8", timeout: 60000, windowsHide: true });
    if (result.status !== 0) throw new Error(`Docker ${args[0]} failed`);
    return result.stdout.trim();
  };
  const wait = async (predicate: () => Promise<boolean>, label: string, timeout = 20000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Timed out: ${label}`);
  };
  const stop = async (child: ChildProcess | undefined, graceful = false) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    if (graceful && child.connected) child.send({ type: "shutdown" }); else child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 6000);
    await exited; clearTimeout(timer);
  };
  const freePort = async () => {
    const server = createTcpServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port; await new Promise<void>(resolve => server.close(() => resolve())); return port;
  };
  let providerAttempts = 0; let providerEffects = 0;
  const providerKeys = new Set<string>();
  const provider = createServer(async (req, res) => {
    for await (const _chunk of req) { /* Consume synthetic test payload only. */ }
    providerAttempts++;
    const key = String(req.headers["idempotency-key"]);
    if (!providerKeys.has(key)) { providerKeys.add(key); providerEffects++; req.socket.destroy(); return; }
    res.writeHead(202, { "x-delivery-id": "fixture" }); res.end("ok");
  });
  try {
    const migration = new Client({ connectionString: process.env.DATABASE_URL });
    await migration.connect();
    try {
      await migration.query("DROP TABLE integration_task_receipts");
      await migration.query(await readFile(path.join(__dirname, "../../prisma/migrations/20261028120000_background_task_receipts/migration.sql"), "utf8"));
    } finally { await migration.end(); }
    docker("run", "--rm", "-d", "--name", container, "-p", "127.0.0.1::6379", "redis:7-alpine"); created = true;
    const port = docker("port", container, "6379/tcp").split(":").at(-1);
    const redisUrl = `redis://127.0.0.1:${port}`;
    redis = new Redis(redisUrl, { maxRetriesPerRequest: null }); redis.on("error", () => {}); await redis.ping();
    const commonEnv = { ...process.env, NODE_ENV: "integration", REDIS_URL: redisUrl, DISABLE_REDIS: "false", DISABLE_AUTOMATION_WORKER: "true", WEBHOOK_QUEUE_ENABLED: "false", META_QUEUE_ENABLED: "true", ZALO_QUEUE_ENABLED: "false", REMINDER_QUEUE_ENABLED: "true", META_APP_SECRET: "background-fixture-only", OPERATIONS_ENVIRONMENT: `background_${suffix}`, GPT_API_KEY: "", "GPT-API-KEY": "" };
    const start = (entry: string, extra: Record<string, string> = {}, args: string[] = []) => {
      const child = spawn(process.execPath, ["--import", "tsx", entry, ...args], { env: { ...commonEnv, ...extra }, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
      child.stdout?.resume(); child.stderr?.resume(); children.push(child); return child;
    };
    const readyWorker = async () => {
      const child = start("src/integration/background-worker.fixture.ts");
      await Promise.race([once(child, "message"), once(child, "exit").then(() => { throw new Error("Fixture worker failed to start"); })]);
      return child;
    };
    const program = await prisma.institution_programs.findFirstOrThrow();
    const user = await prisma.users.findFirstOrThrow({ where: { email: "director@tvu.edu.vn" } });
    const role = await prisma.roles.findFirstOrThrow({ where: { code: "DIRECTOR" } });
    await prisma.user_program_roles.create({ data: { user_id: user.id, institution_program_id: program.id, role_id: role.id } });
    const sensitive = await prisma.permissions.upsert({ where: { code: "lead.sensitive.view" }, update: {}, create: { code: "lead.sensitive.view", name: "Fixture sensitive", module: "lead" } });
    await prisma.role_permissions.upsert({ where: { role_id_permission_id: { role_id: role.id, permission_id: sensitive.id } }, update: {}, create: { role_id: role.id, permission_id: sensitive.id } });
    const source = await prisma.lead_sources.findFirstOrThrow();
    const lead = await prisma.leads.create({ data: { full_name: `Lifecycle ${suffix}`, phone: "0901234567", email: "fixture@example.test", source_id: source.id, institution_program_id: program.id, owner_id: user.id, assigned_to: user.id } });
    const connection = await prisma.meta_connections.create({ data: { page_id: String(suffix), page_name: "Fixture", page_access_token_encrypted: "invalid-fixture-token-never-sent", institution_program_id: program.id, lead_source_id: source.id, created_by: user.id } });
    const meta = new Queue("meta_messenger_integration_queue", { connection: redis as never }); queues.push(meta);
    const apiPorts = await Promise.all([freePort(), freePort()]);
    let apis = apiPorts.map(port => start("src/api.ts", { PORT: String(port) }));
    await Promise.all(apiPorts.map(port => wait(async () => { try { return (await fetch(`http://127.0.0.1:${port}/api/ready`)).ok; } catch { return false; } }, "API startup")));
    assert.equal((await meta.getWorkers()).length, 0, "API imports must never start integration workers");
    const payload = JSON.stringify({ object: "page", entry: [{ id: connection.page_id, messaging: [{ sender: { id: "fixture-sender" }, recipient: { id: connection.page_id }, timestamp: Date.now(), message: { mid: "fixture-delivery", text: "fixture" } }] }] });
    const headers = { "Content-Type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", commonEnv.META_APP_SECRET).update(payload).digest("hex")}` };
    const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => fetch(`http://127.0.0.1:${apiPorts[index % 2]}/api/integrations/meta/webhook`, { method: "POST", headers, body: payload })));
    assert.ok(responses.every(response => response.status === 200), `Webhook responses: ${JSON.stringify(await Promise.all(responses.map(async response => ({ status: response.status, body: await response.text() }))))}`);
    assert.equal(await prisma.meta_messages.count({ where: { connection_id: connection.id } }), 1);
    assert.equal(await meta.getWaitingCount(), 1);
    const message = await prisma.meta_messages.findFirstOrThrow({ where: { connection_id: connection.id } });
    await Promise.all(apis.map(child => stop(child)));
    apis = apiPorts.map(port => start("src/api.ts", { PORT: String(port) }));
    await wait(async () => { try { return (await fetch(`http://127.0.0.1:${apiPorts[0]}/api/health`)).ok; } catch { return false; } }, "API restart");
    assert.equal(await meta.getWaitingCount(), 1, "Restarting API cannot lose persisted work");
    let workers: ChildProcess[] = await Promise.all([readyWorker(), readyWorker()]);
    for (let index = 0; index < 5; index++) await meta.add("process_message", { messageId: message.id }, { jobId: `duplicate-${index}`, attempts: 8, backoff: { type: "exponential", delay: 500 } });
    await wait(async () => (await prisma.meta_messages.findUniqueOrThrow({ where: { id: message.id } })).processing_status === "completed", "duplicate event processing");
    assert.equal(await prisma.audit_logs.count({ where: { entity_type: "background_fixture", entity_id: message.id } }), 1);
    const slow = await prisma.meta_messages.create({ data: { connection_id: connection.id, meta_message_id: "slow", sender_psid: "slow-sender", direction: "inbound", event_type: "message", message_text: "slow", sent_at: new Date(), raw_payload: {} } });
    await Promise.all(workers.map(child => stop(child, true)));
    workers = [await readyWorker()];
    await meta.add("process_message", { messageId: slow.id });
    await wait(async () => await prisma.audit_logs.count({ where: { entity_id: slow.id, entity_type: "background_fixture" } }) === 1, "active job before drain");
    await stop(workers[0], true);
    assert.equal(workers[0].exitCode, 0);
    assert.equal((await prisma.meta_messages.findUniqueOrThrow({ where: { id: slow.id } })).processing_status, "completed");
    const crashed = await prisma.meta_messages.create({ data: { connection_id: connection.id, meta_message_id: "crashed", sender_psid: "crash-sender", direction: "inbound", event_type: "message", message_text: "crash", sent_at: new Date(), raw_payload: {} } });
    workers = [await readyWorker()];
    await meta.add("process_message", { messageId: crashed.id });
    await wait(async () => await prisma.audit_logs.count({ where: { entity_id: crashed.id, entity_type: "background_fixture" } }) === 1, "side effect before crash");
    workers[0].kill("SIGKILL"); await once(workers[0], "exit");
    workers = [await readyWorker()];
    await wait(async () => (await prisma.meta_messages.findUniqueOrThrow({ where: { id: crashed.id } })).processing_status === "needs_review", "quarantine ambiguous crashed task");
    assert.equal(await prisma.audit_logs.count({ where: { entity_type: "background_fixture", entity_id: crashed.id } }), 1);
    await Promise.all(workers.map(child => stop(child, true)));
    const orphan = await prisma.meta_messages.create({ data: { connection_id: connection.id, meta_message_id: "orphan", sender_psid: "orphan-sender", direction: "inbound", event_type: "message", message_text: "xin chào", sent_at: new Date(), raw_payload: {} } });
    const uncertain = await prisma.meta_messages.create({ data: { connection_id: connection.id, meta_message_id: "uncertain-completed", sender_psid: "uncertain-sender", direction: "inbound", event_type: "message", message_text: "fixture", processing_status: "completed", sent_at: new Date(), raw_payload: {} } });
    await prisma.integration_task_receipts.create({ data: { task_key: `message:meta:${uncertain.id}`, provider: "meta", entity_id: uncertain.id, status: "running" } });
    const actualIntegrations = [0, 1].map(() => start("src/workers/integrations.worker.ts"));
    await wait(async () => (await prisma.meta_messages.findUniqueOrThrow({ where: { id: orphan.id } })).processing_status === "ignored", "durable recovery after DB-to-Redis gap");
    await wait(async () => (await prisma.meta_messages.findUniqueOrThrow({ where: { id: uncertain.id } })).processing_status === "needs_review", "completed message with uncertain follow-up quarantined");
    assert.equal((await meta.getJobSchedulers()).length, 1);
    await Promise.all(actualIntegrations.map(child => stop(child)));
    const reminderQueueName = `reminders_${suffix}`;
    const reminderQueue = new Queue(reminderQueueName, { connection: redis as never }); queues.push(reminderQueue);
    await prisma.reminders.create({ data: { lead_id: lead.id, user_id: user.id, title: "Lifecycle reminder", remind_at: new Date(Date.now() - 25 * 3600000) } });
    const assignment = await prisma.lead_assignments.create({ data: { lead_id: lead.id, assigned_to: user.id, assigned_by: user.id, is_main_owner: true, assigned_at: new Date(Date.now() - 300000) } });
    await prisma.system_settings.create({ data: { key: `crm.preferences.${program.id}.sla`, value: JSON.stringify({ version: 1, value: { enabled: true, firstContactMinutes: 5 } }) } });
    await prisma.automation_jobs.create({ data: { type: "sla_first_contact", run_at: new Date(0), payload: { leadId: lead.id, assignmentId: assignment.id, programId: program.id, assigneeId: user.id, assignedAt: assignment.assigned_at!.toISOString() } } });
    let reminderWorkers = [0, 1].map(() => start("src/workers/reminders.worker.ts", { REMINDER_QUEUE_NAME: reminderQueueName, META_QUEUE_ENABLED: "false" }));
    await wait(async () => (await reminderQueue.getWorkers()).length === 2, "two reminder workers");
    for (let index = 0; index < 8; index++) await reminderQueue.add("scan", {});
    await wait(async () => await prisma.notifications.count({ where: { content: { contains: lead.full_name } } }) === 3, "due, overdue and SLA notifications").catch(async error => {
      console.error(JSON.stringify({ notifications: await prisma.notifications.findMany({ select: { type: true, title: true } }), jobs: await prisma.automation_jobs.findMany({ select: { type: true, status: true, error_message: true } }), counts: await reminderQueue.getJobCounts(), failed: (await reminderQueue.getFailed(0, 2)).map(job => job.failedReason) })); throw error;
    });
    await wait(async () => (await reminderQueue.getActiveCount()) + (await reminderQueue.getWaitingCount()) === 0, "scan drain");
    assert.equal((await reminderQueue.getJobSchedulers()).length, 1);
    assert.equal(await prisma.lead_activities.count({ where: { lead_id: lead.id, type: "sla_violation" } }), 1);
    await Promise.all(reminderWorkers.map(child => stop(child)));
    reminderWorkers = [0, 1].map(() => start("src/workers/reminders.worker.ts", { REMINDER_QUEUE_NAME: reminderQueueName, META_QUEUE_ENABLED: "false" }));
    await wait(async () => (await reminderQueue.getWorkers()).length >= 2, "reminder restart");
    await reminderQueue.add("scan", {});
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(await prisma.notifications.count({ where: { content: { contains: lead.full_name } } }), 3);
    await Promise.all(reminderWorkers.map(child => stop(child)));
    // Real HTTP provider accepts the request, then loses its response. No public network is used.
    provider.listen(0, "127.0.0.1"); await once(provider, "listening");
    const rule = await prisma.automation_rules.create({ data: { name: "Fixture", trigger_type: "lead_created", graph_data: {}, created_by: user.id, institution_program_id: program.id } });
    const log = await prisma.automation_execution_logs.create({ data: { rule_id: rule.id } });
    const deliveryNode = await prisma.automation_node_executions.create({ data: { execution_log_id: log.id, node_id: "send", node_type: "send_email" } });
    const send = async (node: string, certified: boolean) => {
      const child = start("src/integration/background-delivery.fixture.ts", { DISABLE_REDIS: "true", AUTOMATION_EMAIL_PROVIDER_URL: `http://127.0.0.1:${(provider.address() as { port: number }).port}`, AUTOMATION_EMAIL_PROVIDER_TOKEN: "fixture", AUTOMATION_EMAIL_IDEMPOTENCY_SUPPORTED: String(certified) }, [user.id, program.id, lead.id, node]);
      await once(child, "exit"); return child.exitCode;
    };
    assert.equal(await send(deliveryNode.id, false), 2);
    assert.equal((await prisma.automation_message_deliveries.findUniqueOrThrow({ where: { node_execution_id: deliveryNode.id } })).status, "needs_review");
    assert.equal(await send(deliveryNode.id, false), 2);
    assert.equal(providerAttempts, 1); assert.equal(providerEffects, 1);
    const safeNode = await prisma.automation_node_executions.create({ data: { execution_log_id: log.id, node_id: "send-safe", node_type: "send_email" } });
    assert.equal(await send(safeNode.id, true), 2);
    assert.equal(await send(safeNode.id, true), 0);
    assert.equal(providerAttempts, 3); assert.equal(providerEffects, 2);
    console.log("PASS: two APIs without consumers, durable duplicate webhook ingestion, two competing workers, one business effect, graceful drain, killed-worker quarantine, reminder/SLA idempotency across replicas/restarts, ambiguous delivery held, certified provider retry deduplicated.");
  } finally {
    await Promise.all(children.map(child => stop(child)));
    await Promise.allSettled(queues.map(queue => queue.close())); redis?.disconnect();
    if (provider.listening) await new Promise<void>(resolve => provider.close(() => resolve()));
    if (created && /^crm-background-test-\d+$/.test(container)) docker("rm", "-f", container);
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
