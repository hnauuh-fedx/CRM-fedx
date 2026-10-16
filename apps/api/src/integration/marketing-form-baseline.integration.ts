import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { prisma } from "../database/prisma";
import { inspectMarketingFormScope } from "../maintenance/marketing-form-scope-inspection";
import { getPublicMarketingFormConfig, submitMarketingForm } from "../modules/campaigns/marketing-form-public.service";
import { getMarketingFormById, updateMarketingForm } from "../modules/campaigns/marketing-form-management.service";
import { listLeadSurveyHistory } from "../modules/campaigns/marketing-form-lead-history.service";
import { listMarketingFormReviewCandidates, resolveMarketingFormSubmission } from "../modules/campaigns/marketing-form-submission-review.service";
import type { AuthUser } from "../modules/auth/auth.types";

async function inspectionRegression() {
  // Temporary tables shadow production tables on this transaction's connection only.
  // This exercises both schema versions without altering application tables/migrations.
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`CREATE TEMP TABLE campaigns (id uuid, institution_program_id uuid) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE marketing_forms (id uuid, campaign_id uuid, status text) ON COMMIT DROP`;
    const programA = randomUUID(), programB = randomUUID(), campaign = randomUUID();
    const ids = Array.from({ length: 5 }, () => randomUUID()).sort();
    await tx.$executeRaw`INSERT INTO campaigns VALUES (${campaign}::uuid, ${programA}::uuid)`;
    await tx.$executeRaw`INSERT INTO marketing_forms VALUES (${ids[0]}::uuid, ${campaign}::uuid, 'active'), (${ids[1]}::uuid, NULL, 'draft')`;
    const before = await inspectMarketingFormScope(tx);
    assert.equal(before.counts.missingProgram, 2n);
    assert.equal(before.counts.backfillable, 1n); assert.equal(before.counts.unresolved, 1n);
    await tx.$executeRaw`ALTER TABLE pg_temp.marketing_forms ADD COLUMN institution_program_id uuid`;
    await tx.$executeRaw`INSERT INTO marketing_forms VALUES (${ids[2]}::uuid, NULL, 'published', ${programA}::uuid), (${ids[3]}::uuid, ${campaign}::uuid, 'active', ${programA}::uuid), (${ids[4]}::uuid, ${campaign}::uuid, 'draft', ${programB}::uuid)`;
    const after = await inspectMarketingFormScope(tx, { limit: 1 });
    assert.deepEqual(after.counts, { total: 5n, assigned: 3n, missingProgram: 2n, backfillable: 1n, unresolved: 1n, liveMissingProgram: 1n, campaignMismatch: 1n });
    assert.equal(after.review[0].reason, 'backfill_candidate'); assert.ok(after.hasMore);
    const page2 = await inspectMarketingFormScope(tx, { afterId: after.nextCursor!, limit: 1 });
    assert.equal(page2.review[0].reason, 'manual_review');
    const page3 = await inspectMarketingFormScope(tx, { afterId: page2.nextCursor!, limit: 1 });
    assert.equal(page3.review[0].reason, 'campaign_mismatch'); assert.equal(page3.hasMore, false);
    assert.equal(page3.nextCursor, null);
    const scoped = await inspectMarketingFormScope(tx, { formIds: [ids[2]] });
    assert.equal(scoped.counts.missingProgram, 0n); assert.equal(scoped.review.length, 0, 'Form có chương trình trực tiếp, không campaign không bị báo nhầm.');
    await assert.rejects(() => inspectMarketingFormScope(tx, { limit: 101 }));
  });
  console.log('PASS G0/G1 inspection: before/after nullable column, direct program, candidate/manual/mismatch and cursor pagination.');
}

async function run() {
  const marker = `g01-${randomUUID()}`;
  const programs: string[] = [], users: string[] = [], forms: string[] = [], leads: string[] = [];
  try {
    await inspectionRegression();
    for (let i = 0; i < 2; i++) {
      const row = await prisma.institution_programs.create({ data: { code: `${marker}-${i}`, name: '[TEST G0/G1]', institution_name: '[TEST]', status: 'active' } });
      programs.push(row.id);
      const user = await prisma.users.create({ data: { email: `${marker}-${i}@example.test`, full_name: '[TEST G0/G1] Sale', password_hash: 'fixture-no-login', status: 'active' } });
      users.push(user.id);
    }
    const fields = [{ fieldKey: 'choice', label: 'Lựa chọn', fieldType: 'radio' as const, options: ['Đáp án cũ', 'Đáp án khác'], isRequired: true, isActive: true, sortOrder: 0 }];
    for (let i = 0; i < 2; i++) {
      const form = await prisma.marketing_forms.create({ data: {
        name: '[TEST G0/G1] Legacy', slug: i === 0 ? `${marker}-slug` : null, public_key: `${marker}-${i}`, status: 'active',
        institution_program_id: programs[0], created_by: users[i], form_type: 'survey', duplicate_settings: {},
        marketing_form_fields: { create: { field_key: 'choice', label: 'Lựa chọn', field_type: 'radio', options: fields[0].options, is_active: true, is_required: true } },
      } });
      forms.push(form.id);
    }
    const orphan = await prisma.marketing_forms.create({ data: { name: '[TEST G0/G1] Missing program', public_key: `${marker}-orphan`, slug: `${marker}-orphan-slug`, status: 'active', created_by: users[0] } });
    forms.push(orphan.id);
    const gate = spawnSync(process.execPath, ['--import', 'tsx', 'src/maintenance/inspect-marketing-form-scope.ts', '--fail-on-unresolved', '--limit=1'], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
    assert.equal(gate.status, 2, gate.stderr);
    const gateReport = JSON.parse(gate.stdout);
    assert.ok(gateReport.counts.missingProgram >= 1); assert.ok(gateReport.review.length <= 1);
    assert.equal(gate.stdout.includes(orphan.public_key!), false, 'Dry-run không xuất public key.');
    const actor = (index: number): AuthUser => ({
      id: users[index], email: 'fixture@example.test', fullName: 'Fixture', avatarUrl: null, roles: [], departmentIds: [],
      institutionProgramIds: programs, accessScope: 'ASSIGNED_ONLY',
      permissions: ['marketing_form.update_own', 'lead.view_assigned', 'lead.update_assigned', 'lead.sensitive.view'],
    });
    const saleA = actor(0), saleB = actor(1);
    for (const key of [orphan.public_key!, orphan.slug!]) {
      assert.equal(await getPublicMarketingFormConfig(key), null, 'Không mở form chưa có chương trình để người dùng điền vô ích.');
      const rejected = await submitMarketingForm({ publicKey: key, payload: { phone: '0990000000', institution_program_id: programs[0] } });
      assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.status, 403);
    }
    assert.equal(await prisma.marketing_form_submissions.count({ where: { marketing_form_id: orphan.id } }), 0);
    assert.equal((await getMarketingFormById(saleA, orphan.id)).ok, false);
    assert.equal((await updateMarketingForm({ ...saleA, accessScope: 'ALL', permissions: ['campaign.view_all', 'marketing_form.manage'] }, orphan.id, { name: '[TEST G0/G1] Cannot auto-assign', status: 'draft', formType: 'survey', fields }, programs[0])).ok, false);
    assert.equal((await prisma.marketing_forms.findUniqueOrThrow({ where: { id: orphan.id } })).institution_program_id, null);
    const phone = `095${Date.now().toString().slice(-7)}`;
    for (let i = 0; i < 3; i++) {
      const lead = await prisma.leads.create({ data: { full_name: '[TEST G0/G1] Lead', phone, institution_program_id: programs[i === 2 ? 1 : 0], assigned_to: users[i === 0 ? 0 : 1] } });
      leads.push(lead.id);
    }
    const historyRows = [];
    for (let i = 0; i < 2; i++) {
      const row = await prisma.marketing_form_submissions.create({ data: { marketing_form_id: forms[i], lead_id: leads[i], raw_payload: { choice: 'Đáp án cũ' }, answers: { choice: 'Đáp án cũ' }, status: 'processed' } });
      historyRows.push(row);
    }
    for (const [index, sale] of [saleA, saleB].entries()) {
      const own = await listLeadSurveyHistory(sale, leads[index], programs[0], 1, 10);
      assert.ok(own.ok); assert.equal(own.data.data[0].id, historyRows[index].id);
      assert.equal((await listLeadSurveyHistory(sale, leads[1 - index], programs[0], 1, 10)).ok, false);
      assert.equal((await listLeadSurveyHistory(sale, leads[2], programs[0], 1, 10)).ok, false);
      assert.equal((await listLeadSurveyHistory({ ...sale, permissions: [] }, leads[index], programs[0], 1, 10)).ok, false);
    }
    const review = await prisma.marketing_form_submissions.create({ data: { marketing_form_id: forms[0], raw_payload: {}, normalized_payload: { phone }, status: 'needs_review' } });
    const candidates = await listMarketingFormReviewCandidates(saleA, programs[0], forms[0], review.id, 1, 10);
    assert.ok(candidates.ok); assert.deepEqual(candidates.data.data.map(row => row.id), [leads[0]]);
    for (const actorWithoutPermission of [{ ...saleA, permissions: [] }, { ...saleA, accessScope: 'READ_ONLY' as const }]) {
      assert.equal((await resolveMarketingFormSubmission(actorWithoutPermission, programs[0], forms[0], review.id, { action: 'ignore', reason: 'Fixture' })).ok, false);
    }
    for (const leadId of [leads[1], leads[2]]) assert.equal((await resolveMarketingFormSubmission(saleA, programs[0], forms[0], review.id, { action: 'link', leadId, reason: 'Fixture' })).ok, false);
    assert.ok((await resolveMarketingFormSubmission(saleA, programs[0], forms[0], review.id, { action: 'link', leadId: leads[0], reason: 'Fixture' })).ok);
    console.log('PASS G0/G1 service matrix: two Sale, same phone/two programs, assigned scope, missing permission/read-only and authorized review.');

    const before = await prisma.marketing_forms.findUniqueOrThrow({ where: { id: forms[0] } });
    assert.equal((await getPublicMarketingFormConfig(before.public_key!))?.id, before.id);
    assert.equal((await getPublicMarketingFormConfig(before.slug!))?.id, before.id);
    const edited = await updateMarketingForm(saleA, before.id, { name: '[TEST G0/G1] Renamed without changing URL', formType: 'survey', status: 'active', fields, duplicateSettings: {} }, programs[0]);
    assert.ok(edited.ok);
    const after = await prisma.marketing_forms.findUniqueOrThrow({ where: { id: before.id } });
    assert.equal(after.slug, before.slug, 'Đổi tên không tự đổi slug cũ.');
    assert.equal(after.public_key, before.public_key); assert.deepEqual(after.duplicate_settings, {});
    assert.deepEqual(await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: historyRows[0].id } }), historyRows[0]);
    const nullSlugEdit = await updateMarketingForm(saleB, forms[1], { name: '[TEST G0/G1] Null slug retained', formType: 'survey', status: 'active', fields }, programs[0]);
    assert.ok(nullSlugEdit.ok);
    assert.equal((await prisma.marketing_forms.findUniqueOrThrow({ where: { id: forms[1] } })).slug, null);
    const received = await submitMarketingForm({ publicKey: before.slug!, payload: { choice: 'Đáp án cũ' }, idempotencyKey: randomUUID() });
    assert.ok(received.ok);
    const receipt = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: received.data.submissionId } });
    assert.equal(receipt.lead_id, null); assert.deepEqual(receipt.answers, { choice: 'Đáp án cũ' });
    assert.equal((receipt.configuration_snapshot as { schemaVersion: number }).schemaVersion, 1);
    assert.equal(await prisma.leads.count({ where: { institution_program_id: { in: programs } } }), 3);
    assert.equal((await getPublicMarketingFormConfig(before.public_key!))?.id, before.id);
    const changedSlug = `${marker}-explicit`;
    assert.ok((await updateMarketingForm(saleA, before.id, { name: '[TEST G0/G1] Explicit URL change', slug: changedSlug, formType: 'survey', status: 'active', fields }, programs[0])).ok);
    assert.equal((await getPublicMarketingFormConfig(changedSlug))?.id, before.id);
    assert.equal(await getPublicMarketingFormConfig(before.slug!), null);
    assert.equal((await getPublicMarketingFormConfig(before.public_key!))?.id, before.id);
    assert.deepEqual(await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: historyRows[0].id } }), historyRows[0]);
    console.log('PASS G0/G1 legacy: slug/public key, null slug, old string answers and historic row unchanged; new response snapshot version 1.');
  } finally {
    const submissions = await prisma.marketing_form_submissions.findMany({ where: { marketing_form_id: { in: forms } }, select: { id: true } });
    await prisma.automation_jobs.deleteMany({ where: { id: { in: submissions.map(row => row.id) }, type: 'marketing_form_event' } });
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: users }, entity_type: { in: ['marketing_form', 'marketing_form_submission', 'lead'] } } });
    await prisma.marketing_forms.deleteMany({ where: { id: { in: forms } } });
    await prisma.leads.deleteMany({ where: { id: { in: leads } } });
    await prisma.users.deleteMany({ where: { id: { in: users } } });
    await prisma.institution_programs.deleteMany({ where: { id: { in: programs } } });
    await prisma.$disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
