import { hostname } from "node:os";
import { Client } from "pg";
import "dotenv/config";
import type { MonitorDocument } from "./operations-monitor";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2500, statement_timeout: 2500 });
  try {
    await client.connect();
    const row = (await client.query("SELECT value FROM operations_monitor_states WHERE key='main'")).rows[0];
    const value = row?.value as MonitorDocument | undefined;
    if (!value || Date.now() - value.observedAt > value.staleAfterMs || value.producer?.host !== hostname() || value.producer?.commit !== (process.env.RELEASE_COMMIT ?? "development")) throw new Error("Monitor snapshot is missing or stale");
  } finally { await client.end(); }
}
void main().catch(() => { process.exitCode = 1; });
