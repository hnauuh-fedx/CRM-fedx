import "dotenv/config";
import { z } from "zod";
import { postgresConnectionOptions, postgresEnvironmentSchema } from "@admission-crm/shared/postgres-config";

const token = z.string().min(32);
export const config = z.object({
  CONTROL_DATABASE_URL: z.string().url(),
  CONTROL_DATABASE_DIRECT_URL: z.preprocess(value => value === "" ? undefined : value, z.string().url().optional()),
  CONTROL_DATABASE_SSL_MODE: z.enum(["url", "verify-full"]).default("url"),
  CONTROL_DATABASE_SSL_CA: z.preprocess(value => value === "" ? undefined : value, z.string().min(1).optional()),
  CONTROL_DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(50).default(8),
  CONTROL_API_TOKEN: token,
  CONTROL_CI_TOKEN: token,
  CONTROL_RECOVERY_TOKEN: token,
  CONTROL_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  CONTROL_BIND_HOST: z.string().default("127.0.0.1"),
  CONTROL_DEPLOYMENT_MODE: z.enum(["compose", "prepare-only", "render-cloudflare"]).default("compose"),
  CONTROL_CLOUD_TOPOLOGY_FILE: z.string().optional(),
  CONTROL_RENDER_TOKEN: z.string().optional(),
  CONTROL_CLOUDFLARE_TOKEN: z.string().optional(),
  CONTROL_ARTIFACT_ENDPOINT: z.preprocess(value => value === "" ? undefined : value, z.string().url().optional()),
  CONTROL_ARTIFACT_BUCKET: z.string().optional(),
  CONTROL_ARTIFACT_ACCESS_KEY_ID: z.string().optional(),
  CONTROL_ARTIFACT_SECRET_ACCESS_KEY: z.string().optional(),
  CONTROL_STAGING_CRM_DATABASE_URL: z.string().optional(),
  CONTROL_PRODUCTION_CRM_DATABASE_URL: z.string().optional(),
  CONTROL_CRM_DATABASE_SSL_CA: z.string().optional(),
  CONTROL_CLOUD_TIMEOUT_MS: z.coerce.number().int().min(1000).max(1800000).default(600000),
  CONTROL_IMAGE_PREFIX: z.string().regex(/^[a-z0-9][a-z0-9./_-]+\/$/),
  CONTROL_SCHEMA_GENERATION: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
  CONTROL_STAGING_DIRECTORY: z.string().min(1),
  CONTROL_PRODUCTION_DIRECTORY: z.string().min(1),
}).parse(process.env);
if (config.CONTROL_DEPLOYMENT_MODE === "render-cloudflare") {
  for (const key of ["CONTROL_CLOUD_TOPOLOGY_FILE", "CONTROL_RENDER_TOKEN", "CONTROL_CLOUDFLARE_TOKEN", "CONTROL_ARTIFACT_ENDPOINT", "CONTROL_ARTIFACT_BUCKET", "CONTROL_ARTIFACT_ACCESS_KEY_ID", "CONTROL_ARTIFACT_SECRET_ACCESS_KEY", "CONTROL_STAGING_CRM_DATABASE_URL", "CONTROL_PRODUCTION_CRM_DATABASE_URL"] as const) if (!config[key]) throw new Error(`Missing cloud configuration: ${key}`);
  if (!config.CONTROL_ARTIFACT_ENDPOINT!.startsWith("https://")) throw new Error("Artifact storage requires HTTPS.");
}
if (new Set([config.CONTROL_API_TOKEN, config.CONTROL_CI_TOKEN, config.CONTROL_RECOVERY_TOKEN]).size !== 3) {
  throw new Error("Control API, CI and recovery tokens must be different.");
}

export const controlDatabaseConnectionOptions = postgresConnectionOptions(postgresEnvironmentSchema.parse({
  DATABASE_URL: config.CONTROL_DATABASE_URL, DATABASE_DIRECT_URL: config.CONTROL_DATABASE_DIRECT_URL,
  DATABASE_SSL_MODE: config.CONTROL_DATABASE_SSL_MODE, DATABASE_SSL_CA: config.CONTROL_DATABASE_SSL_CA,
  DATABASE_LOCK_POOL_MAX: config.CONTROL_DATABASE_POOL_MAX,
}), true);
