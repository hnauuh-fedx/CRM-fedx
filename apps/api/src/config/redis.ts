import { Redis } from "ioredis";

import { env } from "./env";

export const isRedisDisabled =
  process.env.DISABLE_AUTOMATION_WORKER === "true" || process.env.NODE_ENV === "test";

export const redisConnection = isRedisDisabled
  ? null
  : new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

redisConnection?.on("error", (error) => {
  console.error("Redis connection error:", error);
});
