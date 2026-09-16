import { Redis } from "ioredis";

import { env } from "./env";

export const isRedisDisabled =
  process.env.DISABLE_REDIS === "true" ||
  process.env.NODE_ENV === "test";

export const redisConnection = isRedisDisabled
  ? null
  : new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

redisConnection?.on("error", (error) => {
  console.error(
    JSON.stringify({
      event: "redis_connection_error",
      errorType: error.name,
      errorCode: "code" in error ? error.code : undefined,
    }),
  );
});

export const redisCommandConnection = isRedisDisabled
  ? null
  : new Redis(env.REDIS_URL, {
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

redisCommandConnection?.on("error", (error) => {
  console.error(
    JSON.stringify({
      event: "redis_command_connection_error",
      errorType: error.name,
      errorCode: "code" in error ? error.code : undefined,
    }),
  );
});
