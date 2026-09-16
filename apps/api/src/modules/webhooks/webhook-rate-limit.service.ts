import type { Redis } from "ioredis";

import { env } from "../../config/env";
import { redisCommandConnection } from "../../config/redis";
import { incrementWebhookMetric } from "./webhook-metrics";

export type WebhookRateLimitResult = { allowed: boolean; retryAfterSeconds: number };
export type WebhookRateLimiter = (webhookId: string) => Promise<WebhookRateLimitResult>;

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

export function createRedisWebhookRateLimiter(
  redis: Pick<Redis, "eval"> | null = redisCommandConnection,
  limit = env.WEBHOOK_RATE_LIMIT_PER_MINUTE,
  windowMs = 60_000,
): WebhookRateLimiter {
  return async (webhookId) => {
    if (!redis) {
      incrementWebhookMetric("webhook_rate_limiter_unavailable_total");
      throw new Error("WEBHOOK_RATE_LIMITER_UNAVAILABLE");
    }
    const window = Math.floor(Date.now() / windowMs);
    const key = `crm:webhook:ratelimit:${webhookId}:${window}`;
    const result = (await redis.eval(script, 1, key, String(windowMs))) as [number, number];
    const allowed = Number(result[0]) <= limit;
    if (!allowed) incrementWebhookMetric("webhook_rate_limited_total");
    return { allowed, retryAfterSeconds: Math.max(1, Math.ceil(Number(result[1]) / 1000)) };
  };
}

export function createMemoryWebhookRateLimiter(limit = 300, windowMs = 60_000): WebhookRateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return async (webhookId) => {
    const now = Date.now();
    const current = windows.get(webhookId);
    if (!current || now - current.startedAt >= windowMs) {
      windows.set(webhookId, { startedAt: now, count: 1 });
      return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
    }
    current.count += 1;
    return {
      allowed: current.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1000)),
    };
  };
}
