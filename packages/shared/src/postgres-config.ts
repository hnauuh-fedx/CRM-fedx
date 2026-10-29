import { z } from "zod";

const optionalText = z.preprocess(value => value === "" ? undefined : value, z.string().min(1).optional());
export const postgresEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: optionalText,
  DATABASE_SSL_MODE: z.enum(["url", "verify-full"]).default("url"),
  DATABASE_SSL_CA: optionalText,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_LOCK_POOL_MAX: z.coerce.number().int().min(2).max(100).default(12),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),
}).superRefine((value, context) => {
  if (value.DATABASE_SSL_CA && value.DATABASE_SSL_MODE !== "verify-full") {
    context.addIssue({ code: "custom", path: ["DATABASE_SSL_MODE"], message: "A custom CA requires verify-full TLS." });
  }
});
export type PostgresEnvironment = z.infer<typeof postgresEnvironmentSchema>;

// The caller chooses session=true for advisory locks and migrations. URL TLS behavior is unchanged by default.
export function postgresConnectionOptions(input: PostgresEnvironment, session = false) {
  let connectionString = session ? input.DATABASE_DIRECT_URL ?? input.DATABASE_URL : input.DATABASE_URL;
  const common = { connectionString, max: session ? input.DATABASE_LOCK_POOL_MAX : input.DATABASE_POOL_MAX, connectionTimeoutMillis: input.DATABASE_CONNECT_TIMEOUT_MS };
  if (input.DATABASE_SSL_MODE === "url") return common;
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid PostgreSQL URL.");
  // pg otherwise lets connection-string SSL parameters replace the explicit verification settings.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(key);
  connectionString = url.toString();
  return { ...common, connectionString, ssl: { rejectUnauthorized: true, ...(input.DATABASE_SSL_CA ? { ca: input.DATABASE_SSL_CA.replace(/\\n/g, "\n") } : {}) } };
}
