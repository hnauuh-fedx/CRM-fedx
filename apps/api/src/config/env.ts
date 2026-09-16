import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must contain at least 32 characters."),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(28_800),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required.").default("redis://localhost:6379"),
  WEBHOOK_QUEUE_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  WEBHOOK_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(10),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  WEBHOOK_PROCESSING_STALE_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
  WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(300),
  METABASE_PUBLIC_URL: z.string().url().optional(),
  METABASE_EMBEDDING_SECRET: z.string().min(32).optional(),
  METABASE_DASHBOARD_SALE_PIPELINE_ID: z.coerce.number().int().positive().optional(),
  METABASE_GUEST_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
});

export const env = envSchema.parse(process.env);
