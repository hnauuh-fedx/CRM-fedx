import type { Queue } from "bullmq";

export async function enqueueStoredMessage(queue: Queue | null, provider: "zalo" | "meta", messageId: string) {
  if (!queue) return false;
  const jobId = `${provider}-message-${messageId}`;
  const previous = await queue.getJob(jobId);
  if (previous) {
    if (await previous.getState() === "failed") await previous.retry();
    return true;
  }
  await queue.add("process_message", { type: "process_message", messageId }, { jobId, attempts: 8, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 });
  return true;
}
