import { hostname } from "node:os";
import { Client } from "pg";
import "dotenv/config";
import { releaseCommit } from "../../config/release-commit";
import { postgresConnectionOptions, postgresEnvironmentSchema } from "@admission-crm/shared/postgres-config";
import type { MonitorDocument } from "./operations-monitor";

async function main() {
  const client = new Client({ ...postgresConnectionOptions(postgresEnvironmentSchema.parse(process.env)), connectionTimeoutMillis: 2500, statement_timeout: 2500 });
  try {
    await client.connect();
    const row = (await client.query("SELECT value FROM operations_monitor_states WHERE key='main'")).rows[0];
    const value = row?.value as MonitorDocument | undefined;
    if (!value || Date.now() - value.observedAt > value.staleAfterMs || value.producer?.host !== hostname() || value.producer?.commit !== releaseCommit()) throw new Error("Monitor snapshot is missing or stale");
  } finally { await client.end(); }
}
void main().catch(() => { process.exitCode = 1; });
