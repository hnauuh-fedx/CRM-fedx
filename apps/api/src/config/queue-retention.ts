import { env } from "./env";

// Zero preserves each queue's existing policy. Cloud operators can opt into a bounded failed-job count.
export function failedJobRetention(fallback: boolean | number, count = env.QUEUE_FAILED_RETENTION_COUNT) {
  return count > 0 ? { count } : fallback;
}
