import { Worker, type Job } from "bullmq";

import { env } from "../../config/env";
import { redisConnection } from "../../config/redis";
import { processInboundWebhookRequest } from "./webhook-v2.service";
import { WEBHOOK_QUEUE_NAME, type WebhookJobData } from "./webhook-queue.service";

export function createWebhookWorker() {
  if (!env.WEBHOOK_QUEUE_ENABLED || !redisConnection) throw new Error("Webhook worker yêu cầu Redis và WEBHOOK_QUEUE_ENABLED=true.");
  return new Worker<WebhookJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookJobData>) => {
      const result = await processInboundWebhookRequest(job.data.requestId, { workerId: job.id });
      if (result.retry && "error" in result) throw result.error;
      return result;
    },
    { connection: redisConnection as never, concurrency: env.WEBHOOK_WORKER_CONCURRENCY },
  );
}
