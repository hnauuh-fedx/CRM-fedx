import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { env } from "../config/env";
import type { AuthUser } from "../modules/auth/auth.types";

// Never load-test the source database: create a disposable local database first.
const source = new URL(env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(source.hostname), "Scale fixture requires local PostgreSQL.");
const databaseName = `crm_form_report_test_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(source); adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString() });
const isolatedUrl = new URL(source); isolatedUrl.pathname = `/${databaseName}`;
let fixture: Client | undefined;
let prisma: typeof import("../database/prisma")["prisma"] | undefined;

async function run() {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  fixture = new Client({ connectionString: isolatedUrl.toString() }); await fixture.connect();
  await fixture.query(`
    CREATE TABLE marketing_forms (id uuid PRIMARY KEY, name varchar(255), institution_program_id uuid, created_by uuid);
    CREATE TABLE pipeline_stages (id uuid PRIMARY KEY, name varchar(255));
    CREATE TABLE leads (id uuid PRIMARY KEY, institution_program_id uuid, pipeline_stage_id uuid, owner_id uuid, assigned_to uuid, deleted_at timestamp);
    CREATE TABLE marketing_form_submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), marketing_form_id uuid, lead_id uuid,
      status varchar(50), created_at timestamp, raw_payload jsonb, normalized_payload jsonb, answers jsonb, configuration_snapshot jsonb,
      source varchar(100), error_message text);
    CREATE INDEX idx_marketing_form_submissions_form_page ON marketing_form_submissions(marketing_form_id, created_at, id);
    CREATE INDEX idx_marketing_form_submissions_form_status_page ON marketing_form_submissions(marketing_form_id, status, created_at, id);
    CREATE INDEX idx_marketing_form_submissions_lead_page ON marketing_form_submissions(lead_id, created_at, id);
    CREATE TABLE audit_logs (id uuid DEFAULT gen_random_uuid(), user_id uuid, entity_type varchar(100), entity_id uuid,
      action varchar(100), ip_address varchar(100), new_data jsonb, created_at timestamp DEFAULT now());
  `);
  const programId = randomUUID(), otherProgram = randomUUID(), formId = randomUUID(), otherForm = randomUUID(), userId = randomUUID(), stageId = randomUUID();
  await fixture.query("INSERT INTO marketing_forms VALUES ($1,$2,$3,$4),($5,'Other program',$6,$4)", [formId, '=HYPERLINK("https://example.test")', programId, userId, otherForm, otherProgram]);
  await fixture.query("INSERT INTO pipeline_stages VALUES ($1,'Giai đoạn thử nghiệm')", [stageId]);
  await fixture.query("INSERT INTO leads SELECT gen_random_uuid(), $1, $2, $3, $3, NULL FROM generate_series(1,100)", [programId, stageId, userId]);
  const lead = (await fixture.query("SELECT id FROM leads LIMIT 1")).rows[0].id;
  await fixture.query(`INSERT INTO marketing_form_submissions(marketing_form_id,lead_id,status,created_at,raw_payload)
    SELECT $1, CASE WHEN n%5 IN (0,1,2) THEN $2::uuid ELSE NULL END,
      (ARRAY['processed','updated','linked','failed','needs_review'])[n%5+1],
      timestamp '2026-10-01' + (n%30)*interval '1 day', '{}'::jsonb FROM generate_series(1,50000) n`, [formId, lead]);
  await fixture.query("INSERT INTO marketing_form_submissions(marketing_form_id,status,created_at,raw_payload) VALUES ($1,'failed',now(),'{}')", [otherForm]);
  await fixture.query("ANALYZE marketing_form_submissions; ANALYZE leads");
  await fixture.query(`UPDATE marketing_form_submissions SET lead_id=NULL, configuration_snapshot='{"processingOutcome":"created_lead"}' WHERE id=(SELECT id FROM marketing_form_submissions WHERE status='processed' LIMIT 1)`);
  env.DATABASE_URL = isolatedUrl.toString();
  ({ prisma } = await import("../database/prisma.js"));
  const { getMarketingFormReport, exportMarketingFormReport, marketingFormReportQuerySchema } = await import("../modules/campaigns/marketing-form-report.service.js");
  const actor: AuthUser = { id: userId, email: "fixture@example.test", fullName: "Fixture", avatarUrl: null, roles: [],
    permissions: ["campaign.view_all", "report.marketing.view", "lead.view_all", "report.personal.export"], accessScope: "ALL", departmentIds: [], institutionProgramIds: [programId] };
  const query = { page: 1, limit: 20 };
  const started = performance.now();
  const report = await getMarketingFormReport(actor, formId, query);
  assert.ok(report.ok);
  assert.deepEqual(report.data.summary, { total: 50000, accepted: 40000, failed: 10000, duplicate: 30000, needsReview: 10000, newLeads: 10000, updatedLeads: 10000 });
  assert.equal(report.data.pipeline[0].leadCount, 1, "Pipeline counts unique Leads, not submissions.");
  const durationMs = Math.round(performance.now() - started);
  assert.equal((await getMarketingFormReport(actor, otherForm, query)).ok, false);
  assert.equal((await getMarketingFormReport({ ...actor, permissions: [] }, formId, query)).ok, false);
  assert.equal((await getMarketingFormReport({ ...actor, id: randomUUID(), accessScope: "OWNED_ONLY" }, formId, query)).ok, false);
  assert.equal((await exportMarketingFormReport({ ...actor, permissions: actor.permissions.filter(p => p !== "report.personal.export") }, formId, query)).ok, false);
  const hiddenPipeline = await getMarketingFormReport({ ...actor, permissions: actor.permissions.filter(p => p !== "lead.view_all") }, formId, query);
  assert.ok(hiddenPipeline.ok && !hiddenPipeline.data.pipelineVisible && hiddenPipeline.data.pipeline.length === 0);
  const pageTwo = await getMarketingFormReport(actor, formId, { page: 2, limit: 1 });
  assert.ok(pageTwo.ok && pageTwo.data.pipeline.length === 0 && pageTwo.data.summary.total === 50000);
  const dated = await getMarketingFormReport(actor, formId, { ...query, fromDate: "2026-10-01", toDate: "2026-10-01" });
  assert.ok(dated.ok && dated.data.summary.total === 1666);
  assert.equal(marketingFormReportQuerySchema.safeParse({ ...query, fromDate: "2026-10-02", toDate: "2026-10-01" }).success, false);
  const exported = await exportMarketingFormReport(actor, formId, query);
  assert.ok(exported.ok && exported.data.includes("'=HYPERLINK"));
  assert.equal((await fixture.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n, 1);
  const plans: Record<string, unknown> = {};
  for (const [name, sql] of [
    ["list", "SELECT id FROM marketing_form_submissions WHERE marketing_form_id=$1 ORDER BY created_at DESC,id ASC LIMIT 20"],
    ["aggregate", "SELECT status,count(*) FROM marketing_form_submissions WHERE marketing_form_id=$1 GROUP BY status"],
  ]) {
    const plan = (await fixture.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`, [formId])).rows[0]["QUERY PLAN"][0];
    plans[name] = { executionMs: plan["Execution Time"], plan: plan.Plan };
  }
  console.log(JSON.stringify({ result: "PASS", isolated: true, submissions: 50000, reportMs: durationMs, plans }));
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await prisma?.$disconnect(); await fixture?.end();
  // Only the validated, generated fixture database can be dropped.
  assert.match(databaseName, /^crm_form_report_test_[a-f0-9]{32}$/);
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});
