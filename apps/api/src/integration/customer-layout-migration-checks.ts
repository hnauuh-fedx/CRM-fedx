import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { env } from "../config/env";

/** All unqualified migration names resolve to temporary copies, never application tables. */
export async function checkCustomerLayoutMigration() {
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.DATABASE_URL).hostname,
    ),
  );
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  try {
    for (const table of [
      "display_layout_templates",
      "display_layout_versions",
      "display_layout_assignments",
      "display_layout_preferences",
    ]) {
      await db.query(
        `CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`,
      );
      const resolved = await db.query(
        "SELECT relnamespace::regnamespace::text AS schema FROM pg_class WHERE oid = $1::regclass",
        [table],
      );
      assert.match(resolved.rows[0].schema, /^pg_temp_/);
    }
    const id = randomUUID(),
      program = randomUUID(),
      user = randomUUID();
    const draft = {
      name: "Migration fixture",
      visibleFields: ["fullName", "phone"],
      targets: [{ type: "DEFAULT", id: "default" }],
      personalization: {
        visibility: true,
        order: true,
        pinning: true,
        widths: true,
      },
    };
    const presentation = {
      visibleFields: ["phone", "fullName"],
      pinnedFields: ["phone"],
      columnWidths: { phone: 190 },
    };
    await db.query(
      "INSERT INTO display_layout_templates(id, institution_program_id, draft, published, published_version, revision, created_by) VALUES($1,$2,$3,$3,2,4,$4)",
      [id, program, draft, user],
    );
    await db.query(
      "INSERT INTO display_layout_versions(template_id,version,snapshot,actor_id,actor_name) VALUES($1,2,$2,$3,'Fixture')",
      [id, draft, user],
    );
    await db.query(
      "INSERT INTO display_layout_assignments(institution_program_id,target_type,target_id,template_id) VALUES($1,'DEFAULT','default',$2)",
      [program, id],
    );
    await db.query(
      "INSERT INTO display_layout_preferences(institution_program_id,user_id,base_template_id,base_version,presentation,revision) VALUES($1,$2,$3,2,$4,3)",
      [program, user, id, presentation],
    );
    await db.query(
      await readFile(
        resolve(
          __dirname,
          "../../prisma/migrations/20261016120000_customer_list_layouts/migration.sql",
        ),
        "utf8",
      ),
    );
    const copies = await db.query(
      "SELECT * FROM display_layout_templates ORDER BY screen",
    );
    assert.equal(copies.rowCount, 2);
    const customer = copies.rows.find(
      (item) => item.screen === "CUSTOMER_LIST",
    );
    const lead = copies.rows.find((item) => item.screen === "LEAD_LIST");
    assert.equal(lead.id, id);
    assert.notEqual(customer.id, id);
    assert.deepEqual(customer.published, draft);
    assert.equal(customer.revision, 4);
    const pref = await db.query(
      "SELECT * FROM display_layout_preferences WHERE screen='CUSTOMER_LIST'",
    );
    assert.equal(pref.rows[0].base_template_id, customer.id);
    assert.equal(pref.rows[0].base_version, 2);
    assert.equal(pref.rows[0].revision, 3);
    assert.deepEqual(pref.rows[0].presentation, presentation);
    assert.equal(
      (
        await db.query(
          "SELECT template_id FROM display_layout_assignments WHERE screen='CUSTOMER_LIST'",
        )
      ).rows[0].template_id,
      customer.id,
    );
    assert.equal(
      (
        await db.query(
          "SELECT version FROM display_layout_versions WHERE template_id=$1",
          [customer.id],
        )
      ).rows[0].version,
      2,
    );
    console.log(
      "PASS migration preserves shared template, history, assignment and personalized appearance with independent IDs",
    );
  } finally {
    await db.end();
  }
}
