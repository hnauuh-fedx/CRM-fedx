import "dotenv/config";

import { z } from "zod";

const optionalSecret = (minimumLength = 1) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(minimumLength).optional(),
);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must contain at least 32 characters."),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(28_800),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required.").default("redis://localhost:6379"),
  METABASE_PUBLIC_URL: z.string().url().optional(),
  METABASE_EMBEDDING_SECRET: z.string().min(32).optional(),
  METABASE_DASHBOARD_SALE_PIPELINE_ID: z.coerce.number().int().positive().optional(),
  METABASE_GUEST_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  ZALO_APP_ID: optionalSecret(),
  ZALO_APP_SECRET: optionalSecret(),
  ZALO_OA_SECRET_KEY: optionalSecret(),
  ZALO_TOKEN_ENCRYPTION_KEY: optionalSecret(32),
  GPT_API_KEY: optionalSecret(),
  "GPT-API-KEY": optionalSecret(),
  GPT_MODEL: z.string().min(1).default("gpt-5.4-mini"),
});

export const env = envSchema.parse(process.env);

export const gptApiKey = env.GPT_API_KEY ?? env["GPT-API-KEY"];
