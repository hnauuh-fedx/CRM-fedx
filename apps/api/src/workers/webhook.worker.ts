import { prisma } from "../database/prisma";
import { redisCommandConnection, redisConnection } from "../config/redis";
import { createWebhookWorker } from "../modules/webhooks/webhook-worker.service";
import { getWebhookQueueAdapter } from "../modules/webhooks/webhook-queue.service";

const worker = createWebhookWorker();

worker.on("ready", () => console.info(JSON.stringify({ event: "webhook_worker_ready" })));
worker.on("failed", (job, error) => console.error(JSON.stringify({ event: "webhook_worker_job_failed", requestId: job?.data.requestId, queueJobId: job?.id, attempt: job?.attemptsMade, errorType: error.name })));

async function shutdown(signal: string) {
  console.info(JSON.stringify({ event: "webhook_worker_shutdown", signal }));
  await worker.close();
  await getWebhookQueueAdapter()?.close?.();
  await redisCommandConnection?.quit();
  await redisConnection?.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
