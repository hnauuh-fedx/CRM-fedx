import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { env } from "../config/env";

// pg_dump writes a generated backup, never source files. Keep credentials off argv.
const connection = new URL(env.DATABASE_URL);
const file = join(tmpdir(), `admission-crm-before-form-program-${Date.now()}.dump`);
const executable = process.env.PG_DUMP_PATH || "pg_dump";
execFileSync(executable, ["--host", connection.hostname, "--port", connection.port || "5432", "--username", decodeURIComponent(connection.username), "--dbname", connection.pathname.slice(1), "--format", "custom", "--file", file], {
  env: { ...process.env, PGPASSWORD: decodeURIComponent(connection.password) },
  stdio: ["ignore", "ignore", "inherit"],
});
console.log(`Backup created: ${file}`);
