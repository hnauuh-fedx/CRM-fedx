import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "../database/prisma";
import { redisConnection } from "../config/redis";
import { automationQueue, automationWorker } from "../modules/automations/automation-engine.service";
import type { AuthUser } from "../modules/auth/auth.types";
import { bulkUpdateLeads, getBulkUpdateFieldOptions } from "../modules/leads/application/bulk-update-leads.use-case";
import { createFailedLeadStatus } from "../modules/leads/domain/lead-lifecycle-status";

const runId = randomUUID().slice(0, 8);
const phoneSeed = Number.parseInt(runId, 16).toString().padStart(8, "0").slice(-8);
const userIds: string[] = [];
const leadIds: string[] = [];

async function cleanup() {
  if (leadIds.length > 0) {
    await prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: { in: leadIds } } });
    await prisma.admission_profiles.deleteMany({ where: { lead_id: { in: leadIds } } });
    await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  }
  if (userIds.length > 0) {
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function run() {
  const program = await prisma.institution_programs.findFirst({ where: { status: "active" }, select: { id: true } });
  assert.ok(program, "Cần một chương trình đang hoạt động để kiểm tra cập nhật hàng loạt.");
  const [stages, source] = await Promise.all([
    prisma.pipeline_stages.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }], take: 2, select: { id: true } }),
    prisma.lead_sources.findFirst({ where: { OR: [{ institution_program_id: program.id }, { institution_program_id: null }] }, select: { id: true } }),
  ]);
  assert.equal(stages.length, 2, "Cần ít nhất hai tiến trình pipeline.");
  assert.ok(source, "Cần một nguồn học viên thuộc chương trình.");

  const actorUser = await prisma.users.create({
    data: { email: `bulk-update-actor-${runId}@example.test`, password_hash: "integration-only", full_name: "Bulk update actor", status: "active" },
    select: { id: true, email: true, full_name: true, avatar_url: true },
  });
  userIds.push(actorUser.id);
  const createdLeads = await Promise.all([
    prisma.leads.create({ data: { full_name: `Bulk update A ${runId}`, phone: `09${phoneSeed}`, institution_program_id: program.id, pipeline_stage_id: stages[0].id }, select: { id: true } }),
    prisma.leads.create({ data: { full_name: `Bulk update B ${runId}`, phone: `08${phoneSeed}`, institution_program_id: program.id, pipeline_stage_id: stages[0].id }, select: { id: true } }),
    prisma.leads.create({
      data: { full_name: `Bulk update Fail ${runId}`, phone: `07${phoneSeed}`, institution_program_id: program.id, pipeline_stage_id: stages[0].id, status: createFailedLeadStatus(stages[0].id) },
      select: { id: true },
    }),
  ]);
  leadIds.push(...createdLeads.map((lead) => lead.id));
  const [leadA, leadB, failedLead] = leadIds;

  const actor: AuthUser = {
    id: actorUser.id,
    email: actorUser.email,
    fullName: actorUser.full_name,
    avatarUrl: actorUser.avatar_url,
    roles: [],
    permissions: ["lead.view_all", "lead.update_all", "admission.update"],
    departmentIds: [],
    institutionProgramIds: [program.id],
    accessScope: "ALL",
  };

  // Scope is validated for the whole selection before anything is written.
  const outOfScope = await bulkUpdateLeads(actor, [leadA, randomUUID()], { field: "note", value: "Không được ghi" }, program.id);
  assert.equal(outOfScope.ok, false);
  assert.equal(await prisma.lead_notes.count({ where: { lead_id: leadA } }), 0);

  const readOnly = await bulkUpdateLeads({ ...actor, permissions: ["lead.view_all"] }, [leadA], { field: "sourceId", value: source.id }, program.id);
  assert.deepEqual(readOnly, { ok: false, reason: "permission_denied" });

  const stageResult = await bulkUpdateLeads(actor, leadIds, { field: "pipelineStageId", value: stages[1].id }, program.id);
  assert.equal(stageResult.ok, true);
  if (!stageResult.ok) return;
  assert.equal(stageResult.data.updatedCount, 2);
  assert.equal(stageResult.data.failedCount, 1);
  assert.equal(stageResult.data.failures[0].leadId, failedLead);
  assert.equal(await prisma.lead_status_histories.count({ where: { lead_id: { in: [leadA, leadB] }, to_stage_id: stages[1].id } }), 2);
  assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: failedLead } })).pipeline_stage_id, stages[0].id);

  const sourceResult = await bulkUpdateLeads(actor, [leadA, leadB], { field: "sourceId", value: source.id }, program.id);
  assert.equal(sourceResult.ok && sourceResult.data.updatedCount, 2);
  const repeated = await bulkUpdateLeads(actor, [leadA, leadB], { field: "sourceId", value: source.id }, program.id);
  assert.equal(repeated.ok && repeated.data.unchangedCount, 2);
  assert.equal(await prisma.leads.count({ where: { id: { in: [leadA, leadB] }, source_id: source.id } }), 2);

  const revenueResult = await bulkUpdateLeads(actor, [leadA, leadB], { field: "monthlyRevenue", value: "2026-10-31" }, program.id);
  assert.equal(revenueResult.ok && revenueResult.data.updatedCount, 2);
  const profiles = await prisma.admission_profiles.findMany({ where: { lead_id: { in: [leadA, leadB] } }, select: { monthly_revenue: true } });
  assert.equal(profiles.filter((profile) => profile.monthly_revenue?.toISOString().startsWith("2026-10-31")).length, 2);

  const revenueWithoutPermission = await bulkUpdateLeads({ ...actor, permissions: ["lead.view_all", "lead.update_all"] }, [leadA], { field: "monthlyRevenue", value: "2026-11-30" }, program.id);
  assert.equal(revenueWithoutPermission.ok && revenueWithoutPermission.data.failedCount, 1);
  const options = await getBulkUpdateFieldOptions({ ...actor, permissions: ["lead.view_all", "lead.update_all"] }, program.id);
  assert.ok(options.monthlyRevenue.readOnlyReason, "Doanh số tháng phải bị khóa khi thiếu quyền cập nhật hồ sơ tuyển sinh.");
  assert.ok(options.sourceId.options.some((option) => option.id === source.id));

  // Notes are appended as new care notes, never replacing existing ones.
  await bulkUpdateLeads(actor, [leadA, leadB], { field: "note", value: "Ghi chú lần 1" }, program.id);
  const noteResult = await bulkUpdateLeads(actor, [leadA, leadB], { field: "note", value: "Ghi chú lần 2" }, program.id);
  assert.equal(noteResult.ok && noteResult.data.updatedCount, 2);
  assert.equal(await prisma.lead_notes.count({ where: { lead_id: leadA } }), 2);
  assert.equal(await prisma.audit_logs.count({ where: { entity_type: "lead", entity_id: { in: [leadA, leadB] }, action: "bulk_update_information" } }), 4);

  console.log("Bulk lead update applies one field per lead with scope checks, histories, notes and audits.");
}

run()
  .finally(async () => {
    await cleanup();
    await automationWorker?.close();
    await automationQueue?.close();
    await redisConnection?.quit();
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
