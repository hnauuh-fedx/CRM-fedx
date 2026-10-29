import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresConnectionOptions, postgresEnvironmentSchema } from "@admission-crm/shared/postgres-config";

test("local PostgreSQL preserves URL semantics and needs no cloud variables", () => {
  const config = postgresEnvironmentSchema.parse({ DATABASE_URL: "postgresql://test:test@localhost/crm" });
  const options = postgresConnectionOptions(config);
  assert.equal(options.connectionString, config.DATABASE_URL); assert.ok(!("ssl" in options));
  assert.equal(options.max, 10); assert.equal(postgresConnectionOptions(config, true).max, 12);
});

test("session locks use direct URL while normal queries can use a transaction pool", () => {
  const config = postgresEnvironmentSchema.parse({ DATABASE_URL: "postgresql://test@pool/crm", DATABASE_DIRECT_URL: "postgresql://test@direct/crm", DATABASE_POOL_MAX: "3", DATABASE_LOCK_POOL_MAX: "4" });
  assert.equal(postgresConnectionOptions(config).connectionString, config.DATABASE_URL);
  const session = postgresConnectionOptions(config, true); assert.equal(session.connectionString, config.DATABASE_DIRECT_URL); assert.equal(session.max, 4);
});

test("verify-full cannot be downgraded by URL parameters and supports a custom CA", () => {
  const config = postgresEnvironmentSchema.parse({ DATABASE_URL: "postgresql://test@db/crm?sslmode=no-verify&application_name=crm", DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: "line1\\nline2" });
  const options = postgresConnectionOptions(config);
  assert.equal(new URL(options.connectionString).searchParams.get("application_name"), "crm");
  assert.ok(!new URL(options.connectionString).searchParams.has("sslmode"));
  assert.ok("ssl" in options); assert.equal(options.ssl.rejectUnauthorized, true); assert.equal(options.ssl.ca, "line1\nline2");
  assert.equal(postgresEnvironmentSchema.safeParse({ DATABASE_URL: config.DATABASE_URL, DATABASE_SSL_CA: "CA" }).success, false);
});
