import { z } from "zod";

const optional = z.preprocess(value => value === "" ? undefined : value, z.string().min(1).optional());
export const objectStorageConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "integration", "production"]).default("development"),
  FILE_STORAGE_PROVIDER: z.enum(["external", "s3"]).default("external"),
  FILE_UPLOADS_ENABLED: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  FILE_UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(10485760).default(5242880),
  FILE_UPLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  FILE_CLEANUP_TTL_SECONDS: z.coerce.number().int().min(3600).max(604800).default(86400),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().min(1).default("auto"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  S3_SIGNED_URL_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
}).superRefine((config, context) => {
  if (config.FILE_STORAGE_PROVIDER !== "s3") return;
  for (const key of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
    if (!config[key]) context.addIssue({ code: "custom", path: [key], message: "Required when S3 storage is selected." });
  }
  if (config.S3_ENDPOINT) {
    try {
      const url = new URL(config.S3_ENDPOINT);
      const local = config.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) throw new Error();
    } catch { context.addIssue({ code: "custom", path: ["S3_ENDPOINT"], message: "Use HTTPS, or loopback HTTP for local S3 tests." }); }
  }
});
export type ObjectStorageConfig = z.infer<typeof objectStorageConfigSchema>;
