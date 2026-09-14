import { randomUUID } from "node:crypto";
import { Queue, Worker, type Job } from "bullmq";

import { redisConnection } from "../../../config/redis";
import { prisma } from "../../../database/prisma";
import { processZaloMessage, refreshZaloConnection, syncRecentZaloUserProfiles } from "./zalo-integration.service";

type ZaloJobData =
  | { type: "refresh_sweep" }
  | { type: "refresh_connection"; connectionId: string; force?: boolean }
  | { type: "process_message"; messageId: string };

export const ZALO_QUEUE_NAME = "zalo_integration_queue";
const disabled = !redisConnection || process.env.NODE_ENV === "test";

export const zaloQueue = disabled
  ? null
  : new Queue<ZaloJobData>(ZALO_QUEUE_NAME, { connection: redisConnection as any });

export async function enqueueZaloMessage(messageId: string) {
  if (!zaloQueue) return false;
  await zaloQueue.add("process_message", { type: "process_message", messageId }, {
    jobId: `zalo-message-${messageId}`,
    attempts: 4,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
  return true;
}

export async function enqueueZaloRefresh(connectionId: string, force = false) {
  if (!zaloQueue) return false;
  await zaloQueue.add("refresh_connection", { type: "refresh_connection", connectionId, force }, {
    jobId: `zalo-refresh-${connectionId}-${Date.now()}`,
    attempts: 4,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 100,
    removeOnFail: 1_000,
  });
  return true;
}

async function withRefreshLock(connectionId: string, action: () => Promise<void>) {
  if (!redisConnection) return;
  const key = `zalo-token-refresh:${connectionId}`;
  const owner = randomUUID();
  const acquired = await redisConnection.set(key, owner, "PX", 120_000, "NX");
  if (acquired !== "OK") return;
  try {
    await action();
  } finally {
    await redisConnection.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      owner,
    );
  }
}

async function withMessageLock(messageId: string, action: () => Promise<void>) {
  if (!redisConnection) return;
  const message = await prisma.zalo_messages.findUnique({
    where: { id: messageId },
    select: { connection_id: true, zalo_user_id: true },
  });
  if (!message) return;

  const key = `zalo-message-processing:${message.connection_id}:${message.zalo_user_id}`;
  const owner = randomUUID();
  const acquired = await redisConnection.set(key, owner, "PX", 120_000, "NX");
  if (acquired !== "OK") throw new Error("Cuộc hội thoại Zalo đang được một worker khác xử lý.");
  try {
    await action();
  } finally {
    await redisConnection.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      owner,
    );
  }
}

async function runRefreshSweep() {
  const due = await prisma.zalo_connections.findMany({
    where: { status: { in: ["active", "error"] }, next_refresh_at: { lte: new Date() } },
    select: { id: true },
    take: 500,
  });
  await Promise.all(due.map((connection) => enqueueZaloRefresh(connection.id)));
}

export const zaloWorker = disabled
  ? null
  : new Worker<ZaloJobData>(
      ZALO_QUEUE_NAME,
      async (job: Job<ZaloJobData>) => {
        if (job.data.type === "refresh_sweep") {
          await runRefreshSweep();
          return;
        }
        if (job.data.type === "process_message") {
          const { messageId } = job.data;
          await withMessageLock(messageId, () => processZaloMessage(messageId));
          return;
        }
        const { connectionId, force } = job.data;
        await withRefreshLock(connectionId, async () => {
          if (!force) {
            const connection = await prisma.zalo_connections.findUnique({
              where: { id: connectionId },
              select: { next_refresh_at: true },
            });
            if (!connection || connection.next_refresh_at.getTime() > Date.now()) return;
          }
          await refreshZaloConnection(connectionId);
        });
      },
      { connection: redisConnection as any, concurrency: 5 },
    );

zaloWorker?.on("failed", (job, error) => {
  console.error(`Zalo integration job failed: ${job?.id}`, error);
});

if (zaloQueue) {
  zaloQueue.upsertJobScheduler(
    "zalo-refresh-sweep",
    { every: 15 * 60 * 1000 },
    { name: "refresh_sweep", data: { type: "refresh_sweep" } },
  ).catch((error) => console.error("Cannot schedule Zalo token refresh:", error));

  runRefreshSweep().catch((error) => console.error("Cannot reconcile Zalo token refresh jobs:", error));
  syncRecentZaloUserProfiles().catch((error) => console.error("Cannot sync recent Zalo user profiles:", error));
}
