import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { z } from "zod";

async function main() {
// Explicit selections resolve legacy users with multiple roles; no automatic privilege choice.
const choiceSchema = z.tuple([z.uuid(), z.uuid(), z.uuid()]);
const choices = process.argv.slice(2).map((arg) => choiceSchema.parse(arg.split(":")));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const db = new pg.Client({ connectionString: databaseUrl });
const sql = await readFile(resolve(__dirname, "../../../../database/migrations/20261012_add_user_program_roles.sql"), "utf8");
const boundary = sql.indexOf("-- Preserve unambiguous");
await db.connect();
try {
  await db.query(sql.slice(0, boundary));
  const completed = await db.query("SELECT 1 FROM system_settings WHERE key = 'migration.user_program_roles.20261012'");
  for (const [userId, programId, roleId] of completed.rowCount ? [] : choices) {
    const candidate = await db.query(
      "SELECT 1 FROM user_roles ur JOIN role_institution_programs rp ON rp.role_id = ur.role_id WHERE ur.user_id = $1 AND rp.institution_program_id = $2 AND ur.role_id = $3",
      [userId, programId, roleId],
    );
    if (!candidate.rowCount) throw new Error("Selected role is not a legacy assignment for this user/program.");
    const inserted = await db.query(
      "INSERT INTO user_program_roles(user_id, institution_program_id, role_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, institution_program_id) DO NOTHING RETURNING user_id",
      [userId, programId, roleId],
    );
    if (inserted.rowCount) await db.query(
      "INSERT INTO audit_logs(entity_type, entity_id, action, new_data) VALUES ('user', $1, 'migrate_program_role', $2::jsonb)",
      [userId, JSON.stringify({ institutionProgramId: programId, roleId, source: "explicit_migration_choice" })],
    );
  }
  await db.query(sql.slice(boundary));
  console.log("User program roles migrated successfully.");
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
