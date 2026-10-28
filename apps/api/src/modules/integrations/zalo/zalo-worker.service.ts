import { Worker, type Job } from "bullmq";
import { redisConnection } from "../../../config/redis";
import { prisma } from "../../../database/prisma";
import { instrumentWorker } from "../../operations/worker-heartbeat";
import { processDurableIntegrationMessage } from "../shared/integration-message-task";
import { runIntegrationTask } from "../shared/integration-task-receipt";
import { ZALO_QUEUE_NAME, zaloQueue, enqueueZaloMessage, enqueueZaloRefresh, type ZaloJobData } from "./zalo-queue.service";
import { processZaloMessage, refreshZaloConnection, syncRecentZaloUserProfiles } from "./zalo-integration.service";

export async function recoverZaloMessages() {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH candidates AS (
      (SELECT m.id,m.created_at FROM zalo_messages m JOIN zalo_connections c ON c.id=m.connection_id
       WHERE c.status='active' AND m.processing_status='pending' ORDER BY m.created_at,m.id LIMIT 500)
      UNION
      (SELECT m.id,m.created_at FROM integration_task_receipts r JOIN zalo_messages m ON m.id=r.entity_id
       JOIN zalo_connections c ON c.id=m.connection_id WHERE c.status='active' AND r.provider='zalo' AND r.status='running'
       AND r.task_key='message:zalo:'||m.id::text ORDER BY m.created_at,m.id LIMIT 500)
    ) SELECT id FROM candidates ORDER BY created_at,id LIMIT 500`;
  for (const row of rows) await enqueueZaloMessage(row.id);
}
async function refreshConnection(id: string, force: boolean) {
  const connection = await prisma.zalo_connections.findUnique({ where: { id } });
  if (!connection || connection.status === "disconnected" || (!force && connection.next_refresh_at > new Date())) return;
  await runIntegrationTask({ key: `refresh:zalo:${id}:${connection.token_version}`, provider: "zalo", entityId: id, lock: `zalo-refresh:${id}`,
    terminal: async () => (await prisma.zalo_connections.findUnique({ where: { id }, select: { token_version: true } }))?.token_version !== connection.token_version,
    action: async () => { await refreshZaloConnection(id); },
    review: () => prisma.zalo_connections.updateMany({ where: { id, token_version: connection.token_version }, data: { status: "error", last_refresh_error: "Lần refresh trước chưa rõ kết quả. Cần kiểm tra token trước khi thử lại.", updated_at: new Date() } }),
  });
}
async function sweep() {
  await recoverZaloMessages();
  const configuredApp = process.env.ZALO_APP_ID?.trim() ?? "";
  const connections = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c.id FROM zalo_connections c WHERE c.status IN ('active','error') AND c.next_refresh_at<=now()
      AND (${configuredApp}='' OR c.app_id=${configuredApp}) AND NOT EXISTS
      (SELECT 1 FROM integration_task_receipts r WHERE r.task_key='refresh:zalo:'||c.id::text||':'||c.token_version::text AND r.status='needs_review')
    ORDER BY c.next_refresh_at,c.id LIMIT 500`;
  for (const connection of connections) await enqueueZaloRefresh(connection.id);
  await syncRecentZaloUserProfiles();
}
export function createZaloWorker(processMessage = processZaloMessage) {
  if (!zaloQueue || !redisConnection) return null;
  const worker = new Worker<ZaloJobData>(ZALO_QUEUE_NAME, async (job: Job<ZaloJobData>) => {
    if (job.data.type === "refresh_sweep") return sweep();
    if (job.data.type === "refresh_connection") return refreshConnection(job.data.connectionId, job.data.force ?? false);
    const id = job.data.messageId;
    const message = await prisma.zalo_messages.findUnique({ where: { id }, select: { connection_id: true } });
    if (!message) return;
    const connection = await prisma.zalo_connections.findUnique({ where: { id: message.connection_id }, select: { status: true } });
    if (!connection || connection.status === "disconnected") return;
    return processDurableIntegrationMessage("zalo", id, () => processMessage(id));
  }, { connection: redisConnection as never, concurrency: 5 });
  instrumentWorker(worker);
  worker.on("error", () => console.error(JSON.stringify({ event: "zalo_worker_error" })));
  worker.on("failed", () => console.error(JSON.stringify({ event: "zalo_worker_failed" })));
  return worker;
}
export async function scheduleZaloRecovery() {
  if (!zaloQueue) return;
  await zaloQueue.upsertJobScheduler("zalo-recovery-sweep", { every: 60000 }, { name: "refresh_sweep", data: { type: "refresh_sweep" }, opts: { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100, removeOnFail: 1000 } });
  await zaloQueue.removeJobScheduler("zalo-refresh-sweep");
}
