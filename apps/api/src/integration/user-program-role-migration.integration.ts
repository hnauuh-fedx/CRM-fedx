import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { env } from "../config/env";

async function main() {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname), "Use a local test database.");
  const schema = "program_role_migration_" + randomUUID().replaceAll("-", "");
  const db = new pg.Client({ connectionString: env.DATABASE_URL });
  const sql = await readFile(resolve(__dirname, "../../../../database/migrations/20261012_add_user_program_roles.sql"), "utf8");
  const userId = randomUUID(), otherUserId = randomUUID(), programId = randomUUID(), roleA = randomUUID(), roleB = randomUUID();
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}", public`);
    for (const table of ["users", "roles", "institution_programs", "role_institution_programs", "user_roles", "system_settings"]) {
      await db.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await db.query("INSERT INTO users(id,email,full_name,password_hash) VALUES ($1,'migration.a@example.test','Test A','unused'), ($2,'migration.b@example.test','Test B','unused')", [userId, otherUserId]);
    await db.query("INSERT INTO roles(id,code,name) VALUES ($1,'TEST_A','Test A'),($2,'TEST_B','Test B')", [roleA, roleB]);
    await db.query("INSERT INTO institution_programs(id,code,name,institution_name) VALUES ($1,'TEST_PROGRAM','Test program','Test school')", [programId]);
    await db.query("INSERT INTO role_institution_programs(role_id,institution_program_id) VALUES ($1,$3),($2,$3)", [roleA, roleB, programId]);
    await db.query("INSERT INTO user_roles(user_id,role_id) VALUES ($1,$3),($1,$4),($2,$3)", [userId, otherUserId, roleA, roleB]);
    await assert.rejects(db.query(sql), /Multiple legacy roles/, "No silent role selection");
    await db.query("ROLLBACK");
    assert.equal((await db.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=$1 AND table_name='user_program_roles'", [schema])).rows[0].count, 0, "Full migration rollback");
    const boundary = sql.indexOf("-- Preserve unambiguous");
    await db.query(sql.slice(0, boundary));
    await db.query("INSERT INTO user_program_roles(user_id,institution_program_id,role_id) VALUES ($1,$2,$3)", [userId, programId, roleB]);
    await db.query(sql.slice(boundary));
    assert.equal((await db.query("SELECT role_id FROM user_program_roles WHERE user_id=$1", [userId])).rows[0].role_id, roleB);
    assert.equal((await db.query("SELECT role_id FROM user_program_roles WHERE user_id=$1", [otherUserId])).rows[0].role_id, roleA, "Copy unambiguous grant");
    await db.query("DELETE FROM user_program_roles WHERE user_id=$1", [userId]);
    await db.query(sql);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM user_program_roles WHERE user_id=$1", [userId])).rows[0].count, 0, "Rerun cannot restore revoked legacy access");
    console.log("PASS: migration ambiguity guard, atomic rollback, explicit choice, legacy conversion and idempotence after revocation.");
  } finally {
    await db.query("ROLLBACK");
    await db.query("SET search_path TO public");
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
