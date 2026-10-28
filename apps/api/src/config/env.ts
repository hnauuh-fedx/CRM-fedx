import "dotenv/config";

import { z } from "zod";
import { isIP } from "node:net";

const optionalSecret = (minimumLength = 1) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(minimumLength).optional(),
);

const envSchema = z.object({
  RELEASE_CONTROL_URL: z.preprocess(value => value === "" ? undefined : value, z.string().url().optional()),
  RELEASE_CONTROL_TOKEN: optionalSecret(32),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must contain at least 32 characters."),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(900).transform((seconds) => Math.min(seconds, 900)),
  NODE_ENV: z.enum(["development", "test", "integration", "production"]).default("development"),
  AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  AUTH_TRUSTED_PROXY_CIDRS: z.string().default("").transform(value => value.split(",").map(item => item.trim()).filter(Boolean)).refine(items => items.every(item => {
    const [address, prefix, extra] = item.split("/");
    const version = isIP(address);
    return !extra && version !== 0 && (prefix === undefined || (/^\d+$/.test(prefix) && Number(prefix) > 0 && Number(prefix) <= (version === 4 ? 32 : 128)));
  }), "Use explicit proxy IP addresses or CIDRs; wildcard trust is forbidden."),
  AUTH_LOGIN_IP_LIMIT: z.coerce.number().int().min(1).max(10000).default(100),
  AUTH_LOGIN_IP_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(300),
  AUTH_LOGIN_ACCOUNT_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
  AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required.").default("redis://localhost:6379"),
  WEBHOOK_QUEUE_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  ZALO_QUEUE_ENABLED: z.enum(["true", "false"]).default("true").transform(value => value === "true"),
  META_QUEUE_ENABLED: z.enum(["true", "false"]).default("true").transform(value => value === "true"),
  REMINDER_QUEUE_ENABLED: z.enum(["true", "false"]).default("true").transform(value => value === "true"),
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(30000),
  AUTOMATION_EMAIL_IDEMPOTENCY_SUPPORTED: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  AUTOMATION_SMS_IDEMPOTENCY_SUPPORTED: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  AUTOMATION_ZNS_IDEMPOTENCY_SUPPORTED: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  AUTOMATION_WEBHOOK_IDEMPOTENCY_SUPPORTED: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  WEBHOOK_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(10),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  WEBHOOK_PROCESSING_STALE_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
  WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(300),
  ZALO_APP_ID: optionalSecret(),
  ZALO_APP_SECRET: optionalSecret(),
  ZALO_OA_SECRET_KEY: optionalSecret(),
  ZALO_TOKEN_ENCRYPTION_KEY: optionalSecret(32),
  AUTOMATION_SECRET_ENCRYPTION_KEY: optionalSecret(32),
  AUTOMATION_EMAIL_PROVIDER_URL: z.string().url().optional(),
  AUTOMATION_EMAIL_PROVIDER_TOKEN: optionalSecret(),
  AUTOMATION_SMS_PROVIDER_URL: z.string().url().optional(),
  AUTOMATION_SMS_PROVIDER_TOKEN: optionalSecret(),
  AUTOMATION_ZNS_PROVIDER_URL: z.string().url().optional(),
  AUTOMATION_ZNS_PROVIDER_TOKEN: optionalSecret(),
  META_APP_ID: optionalSecret(),
  META_APP_SECRET: optionalSecret(),
  META_WEBHOOK_VERIFY_TOKEN: optionalSecret(32),
  META_TOKEN_ENCRYPTION_KEY: optionalSecret(32),
  META_OAUTH_REDIRECT_URI: z.string().url().optional(),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  TIKTOK_APP_ID: optionalSecret(),
  TIKTOK_SECRET: optionalSecret(),
  TIKTOK_API_BASE: z.string().url().default("https://sandbox-ads.tiktok.com/open_api/v1.3"),
  TIKTOK_ACCESS_TOKEN: optionalSecret(),
  TIKTOK_ADVERTISER_ID: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().regex(/^\d+$/, "TIKTOK_ADVERTISER_ID must be numeric.").optional(),
  ),
  GPT_API_KEY: optionalSecret(),
  "GPT-API-KEY": optionalSecret(),
  GPT_MODEL: z.string().min(1).default("gpt-5.4-mini"),
});

export const env = envSchema.parse(process.env);

export const gptApiKey = env.GPT_API_KEY ?? env["GPT-API-KEY"];
