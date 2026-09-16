import { Queue } from "bullmq";

import { env } from "../../config/env";
import { redisCommandConnection } from "../../config/redis";

export const WEBHOOK_QUEUE_NAME = "webhook_inbound_queue";
export type WebhookJobData = { requestId: string };
export type WebhookQueueAdapter = {
  add(requestId: string): Promise<{ id?: string }>;
  has(requestId: string): Promise<boolean>;
  counts(): Promise<Record<string, number>>;
  close?(): Promise<void>;
};

const bullQueue = env.WEBHOOK_QUEUE_ENABLED && redisCommandConnection
  ? new Queue<WebhookJobData>(WEBHOOK_QUEUE_NAME, { connection: redisCommandConnection as never })
  : null;

const bullAdapter: WebhookQueueAdapter | null = bullQueue
  ? {
      async add(requestId) {
        const jobId = `webhook-request-${requestId}`;
        const existing = await bullQueue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (["completed", "failed"].includes(state)) await existing.remove();
          else return existing;
        }
        return bullQueue.add("process_inbound_webhook", { requestId }, {
          jobId,
          attempts: env.WEBHOOK_MAX_ATTEMPTS,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: false,
        });
      },
      async has(requestId) {
        const job = await bullQueue.getJob(`webhook-request-${requestId}`);
        if (!job) return false;
        return !["completed", "failed"].includes(await job.getState());
      },
      async counts() {
        return bullQueue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
      },
      async close() {
        await bullQueue.close();
      },
    }
  : null;

let overrideAdapter: WebhookQueueAdapter | undefined;

export function setWebhookQueueAdapterForTests(adapter?: WebhookQueueAdapter) {
  overrideAdapter = adapter;
}

export function getWebhookQueueAdapter() {
  return overrideAdapter ?? bullAdapter;
}

export async function enqueueInboundWebhookRequest(requestId: string) {
  const queue = getWebhookQueueAdapter();
  if (!queue) throw new Error("WEBHOOK_QUEUE_UNAVAILABLE");
  return queue.add(requestId);
}
