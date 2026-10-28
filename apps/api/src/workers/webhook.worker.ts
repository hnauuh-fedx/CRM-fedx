import { prisma } from "../database/prisma";
import { redisCommandConnection, redisConnection } from "../config/redis";
import { createWebhookWorker } from "../modules/webhooks/webhook-worker.service";
import { getWebhookQueueAdapter } from "../modules/webhooks/webhook-queue.service";
import { installWorkerShutdown } from "./worker-shutdown";
import { env } from "../config/env";

const worker = createWebhookWorker();

worker.on("ready", () => console.info(JSON.stringify({ event: "webhook_worker_ready" })));
worker.on("failed", (job, error) => console.error(JSON.stringify({ event: "webhook_worker_job_failed", requestId: job?.data.requestId, queueJobId: job?.id, attempt: job?.attemptsMade, errorType: error.name })));

installWorkerShutdown({ name: "webhooks", timeoutMs: env.WORKER_SHUTDOWN_TIMEOUT_MS,
  drain: () => worker.close(), close: async () => {
  await getWebhookQueueAdapter()?.close?.();
  await redisCommandConnection?.quit();
  await redisConnection?.quit();
  await prisma.$disconnect();
} });
