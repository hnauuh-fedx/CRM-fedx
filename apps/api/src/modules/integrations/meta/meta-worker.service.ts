import { randomUUID } from "node:crypto";
import { Queue, Worker, type Job } from "bullmq";
import { redisConnection } from "../../../config/redis";
import { prisma } from "../../../database/prisma";
import { processMetaMessage } from "./meta-integration.service";

type MetaJobData = { type: "process_message"; messageId: string };
export const META_QUEUE_NAME = "meta_messenger_integration_queue";
const disabled = !redisConnection || process.env.NODE_ENV === "test";
export const metaQueue = disabled ? null : new Queue<MetaJobData>(META_QUEUE_NAME, { connection: redisConnection as any });
export async function enqueueMetaMessage(messageId: string) {
  if (!metaQueue) return false;
  await metaQueue.add("process_message", { type: "process_message", messageId }, { jobId: `meta-message-${messageId}`, attempts: 4, backoff: { type: "exponential", delay: 60_000 }, removeOnComplete: 1_000, removeOnFail: 5_000 });
  return true;
}

async function withConversationLock(messageId: string, action: () => Promise<void>) {
  if (!redisConnection) return action();
  const message = await prisma.meta_messages.findUnique({ where: { id: messageId }, select: { connection_id: true, sender_psid: true } });
  if (!message) return;
  const key = `meta-message-processing:${message.connection_id}:${message.sender_psid}`;
  const owner = randomUUID();
  const acquired = await redisConnection.set(key, owner, "PX", 120_000, "NX");
  if (acquired !== "OK") throw new Error("Cuộc hội thoại Messenger đang được một worker khác xử lý.");
  try { await action(); }
  finally {
    await redisConnection.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, owner);
  }
}

export const metaWorker = disabled ? null : new Worker<MetaJobData>(META_QUEUE_NAME, async (job: Job<MetaJobData>) => withConversationLock(job.data.messageId, () => processMetaMessage(job.data.messageId)), { connection: redisConnection as any, concurrency: 5 });
metaWorker?.on("failed", (job, error) => console.error(`Meta integration job failed: ${job?.id}`, error));
