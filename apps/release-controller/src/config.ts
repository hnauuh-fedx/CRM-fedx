import "dotenv/config";
import { z } from "zod";

const token = z.string().min(32);
export const config = z.object({
  CONTROL_DATABASE_URL: z.string().url(),
  CONTROL_API_TOKEN: token,
  CONTROL_CI_TOKEN: token,
  CONTROL_RECOVERY_TOKEN: token,
  CONTROL_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  CONTROL_BIND_HOST: z.string().default("127.0.0.1"),
  CONTROL_IMAGE_PREFIX: z.string().regex(/^[a-z0-9][a-z0-9./_-]+\/$/),
  CONTROL_SCHEMA_GENERATION: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
  CONTROL_STAGING_DIRECTORY: z.string().min(1),
  CONTROL_PRODUCTION_DIRECTORY: z.string().min(1),
}).parse(process.env);
if (new Set([config.CONTROL_API_TOKEN, config.CONTROL_CI_TOKEN, config.CONTROL_RECOVERY_TOKEN]).size !== 3) {
  throw new Error("Control API, CI and recovery tokens must be different.");
}
