import { z } from "zod";

const thresholdSchema = z.object({
  waitingCount: z.number().int().positive().default(100),
  failedCount: z.number().int().positive().default(5),
  waitingMs: z.number().int().positive().default(300_000),
  activeMs: z.number().int().positive().default(900_000),
  noProgressMs: z.number().int().positive().default(600_000),
}).strict();
export type QueueThresholds = z.infer<typeof thresholdSchema>;
export function readMonitorConfig(values: Record<string, string | undefined> = process.env) {
  const config = z.object({
    OPERATIONS_ENVIRONMENT: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).default("local"),
    OPERATIONS_POLL_MS: z.coerce.number().int().min(1000).max(300000).default(15000),
    OPERATIONS_HEARTBEAT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
    OPERATIONS_STALE_MS: z.coerce.number().int().min(3000).max(600000).default(90000),
    OPERATIONS_ALERT_AFTER_MS: z.coerce.number().int().min(0).max(3600000).default(60000),
    OPERATIONS_RECOVERY_AFTER_MS: z.coerce.number().int().min(0).max(3600000).default(30000),
    OPERATIONS_ALERT_WEBHOOK_URL: z.preprocess(value => value === "" ? undefined : value, z.string().url().optional()),
    OPERATIONS_ALERT_WEBHOOK_TOKEN: z.string().optional(),
  }).parse(values);
  if (config.OPERATIONS_STALE_MS < config.OPERATIONS_HEARTBEAT_MS * 3) throw new Error("Heartbeat stale threshold must be at least three heartbeat intervals.");
  if (config.OPERATIONS_ALERT_WEBHOOK_URL) {
    const url = new URL(config.OPERATIONS_ALERT_WEBHOOK_URL);
    if (url.username || url.password || (url.protocol !== "https:" && !(values.NODE_ENV !== "production" && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("Alert webhook requires HTTPS; local HTTP is allowed only outside production.");
  }
  const overrides = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/), thresholdSchema.partial()).parse(JSON.parse(values.OPERATIONS_QUEUE_THRESHOLDS ?? "{}"));
  return { ...config, thresholds: (queue: string): QueueThresholds => thresholdSchema.parse(overrides[queue] ?? {}) };
}
