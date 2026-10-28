import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./store";
import { config } from "./config";

async function main() {
  try {
    await pool.query(await readFile(path.join(__dirname, "../schema.sql"), "utf8"));
    for (const name of ["staging", "production"]) {
      await pool.query("INSERT INTO environments(name,schema_generation) VALUES($1,$2) ON CONFLICT DO NOTHING", [name, config.CONTROL_SCHEMA_GENERATION]);
    }
    console.log("Control database initialized. Existing schema generations are preserved.");
  } finally { await pool.end(); }
}
void main().catch(() => { console.error("Control database initialization failed."); process.exitCode = 1; });
