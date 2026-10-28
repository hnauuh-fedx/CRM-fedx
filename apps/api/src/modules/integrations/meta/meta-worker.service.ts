import { Worker, type WorkerOptions } from "bullmq";
import { redisConnection } from "../../../config/redis";
import { prisma } from "../../../database/prisma";
import { instrumentWorker } from "../../operations/worker-heartbeat";
import { processDurableIntegrationMessage } from "../shared/integration-message-task";
import { META_QUEUE_NAME, metaQueue, enqueueMetaMessage } from "./meta-queue.service";
import { processMetaMessage } from "./meta-integration.service";

export async function recoverMetaMessages() {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH candidates AS (
      (SELECT m.id,m.created_at FROM meta_messages m JOIN meta_connections c ON c.id=m.connection_id
       WHERE c.status='active' AND m.processing_status='pending' ORDER BY m.created_at,m.id LIMIT 500)
      UNION
      (SELECT m.id,m.created_at FROM integration_task_receipts r JOIN meta_messages m ON m.id=r.entity_id
       JOIN meta_connections c ON c.id=m.connection_id WHERE c.status='active' AND r.provider='meta' AND r.status='running'
       AND r.task_key='message:meta:'||m.id::text ORDER BY m.created_at,m.id LIMIT 500)
    ) SELECT id FROM candidates ORDER BY created_at,id LIMIT 500`;
  for (const row of rows) await enqueueMetaMessage(row.id);
}
export function createMetaWorker(processMessage = processMetaMessage, timing: Pick<WorkerOptions, "lockDuration" | "stalledInterval"> = {}) {
  if (!metaQueue || !redisConnection) return null;
  const worker = new Worker(META_QUEUE_NAME, async job => {
    if (job.name === "recovery_sweep") return recoverMetaMessages();
    const id = job.data.messageId as string;
    const message = await prisma.meta_messages.findUnique({ where: { id }, select: { connection_id: true } });
    if (!message || (await prisma.meta_connections.findUnique({ where: { id: message.connection_id }, select: { status: true } }))?.status !== "active") return;
    return processDurableIntegrationMessage("meta", id, () => processMessage(id));
  }, { connection: redisConnection as never, concurrency: 5, ...timing });
  instrumentWorker(worker);
  worker.on("error", () => console.error(JSON.stringify({ event: "meta_worker_error" })));
  worker.on("failed", () => console.error(JSON.stringify({ event: "meta_worker_failed" })));
  return worker;
}
export async function scheduleMetaRecovery() {
  if (!metaQueue) return;
  await metaQueue.upsertJobScheduler("meta-recovery-sweep", { every: 60000 }, { name: "recovery_sweep", data: {}, opts: { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100, removeOnFail: 1000 } });
}
