import { Queue } from "bullmq";
import { env } from "../../../config/env";
import { redisCommandConnection } from "../../../config/redis";
import { enqueueStoredMessage } from "../shared/integration-queue";

export type ZaloJobData = { type: "refresh_sweep" } | { type: "refresh_connection"; connectionId: string; force?: boolean } | { type: "process_message"; messageId: string };
export const ZALO_QUEUE_NAME = "zalo_integration_queue";
export const zaloQueue = redisCommandConnection && env.ZALO_QUEUE_ENABLED
  ? new Queue<ZaloJobData>(ZALO_QUEUE_NAME, { connection: redisCommandConnection as never }) : null;
export const enqueueZaloMessage = (id: string) => enqueueStoredMessage(zaloQueue, "zalo", id);
export async function enqueueZaloRefresh(connectionId: string, force = false) {
  if (!zaloQueue) return false;
  const previous = await zaloQueue.getJob(`zalo-refresh-${connectionId}`);
  if (previous) { if (await previous.getState() === "failed") await previous.retry(); return true; }
  await zaloQueue.add("refresh_connection", { type: "refresh_connection", connectionId, force }, { jobId: `zalo-refresh-${connectionId}`, attempts: 4, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: true, removeOnFail: 1000 });
  return true;
}
