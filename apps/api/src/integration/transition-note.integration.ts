import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../database/prisma";
import { redisCommandConnection, redisConnection } from "../config/redis";
import { env } from "../config/env";
import { customFieldsRouter } from "../modules/custom-fields/custom-fields.router";
import { leadsRouter } from "../modules/leads/leads.router";
import type { AuthUser } from "../modules/auth/auth.types";
import { changeVisibleLeadStage, changeVisibleLeadStatus } from "../modules/leads/application/lead-owner-stage.use-cases";
import { updateLead } from "../modules/leads/application/update-lead.use-case";
import { addLeadNote } from "../modules/leads/application/lead-collaboration.use-cases";
import { initializeLeadOnOpen } from "../modules/leads/application/open-lead.use-case";
import { getLeadDetail } from "../modules/leads/lead-list.service";
import { getTransitionNoteConfiguration, getVisibleTransitionNoteOptions, setTransitionNoteTemplates, transitionNoteSettingKey } from "../modules/leads/transition-note.service";

const run = randomUUID();
const userId = randomUUID();
const outsiderId = randomUUID();
const leadId = randomUUID();
const sourceId = randomUUID();
const pipelineId = randomUUID();
const firstStageId = randomUUID();
const nextStageId = randomUUID();
const templateId = randomUUID();
const disabledId = randomUUID();
const failTemplateId = randomUUID();
const roleId = randomUUID();
let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
const actor: AuthUser = { id: userId, email: `transition.${run}@example.test`, fullName: "Kiểm thử ghi chú", avatarUrl: null, roles: [], permissions: ["lead.update_assigned", "lead.view_assigned", "custom_field.lead.manage"], departmentIds: [], institutionProgramIds: [], accessScope: "ASSIGNED_ONLY" };
let previousFailSetting: { value: string | null; type: string | null } | null = null;
let failSettingBackedUp = false;

async function snapshot() {
  return prisma.leads.findUniqueOrThrow({ where: { id: leadId }, select: {
    status: true, pipeline_stage_id: true, note: true,
    _count: { select: { lead_notes: true, lead_status_histories: true, lead_activities: true } },
  } });
}

async function verifyHttpAccess(programId: string) {
  const app = express();
  app.use(express.json());
  app.use("/api/custom-fields", customFieldsRouter);
  app.use("/api/leads", leadsRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const token = jwt.sign({ sub: userId, type: "access" }, env.JWT_SECRET, { expiresIn: 60 });
  async function request(path: string, options: { method?: string; body?: unknown; authenticated?: boolean } = {}) {
    const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: {
      "Content-Type": "application/json", Connection: "close",
      ...(options.authenticated === false ? {} : { Authorization: `Bearer ${token}` }),
    }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    return { status: response.status, payload: await response.json() as any };
  }
  const configurationPath = "/custom-fields/system/LEAD/note-templates";
  const optionsPath = `/leads/${leadId}/transition-note-options?target=${nextStageId}`;
  assert.equal((await request(configurationPath, { authenticated: false })).status, 401);
  assert.equal((await request(optionsPath, { authenticated: false })).status, 401);
  assert.equal((await request(`/leads/${leadId}/open`, { method: "POST", authenticated: false })).status, 401);
  assert.equal((await request(`/leads/${leadId}/open`, { method: "POST" })).status, 403);
  assert.equal((await request(configurationPath)).status, 403, "Authenticated users without configuration permissions must be denied.");
  assert.equal((await request(optionsPath)).status, 403);

  const permissions = await prisma.permissions.findMany({ where: { code: { in: actor.permissions } }, select: { id: true, code: true } });
  assert.equal(permissions.length, actor.permissions.length, "Required permissions must already exist in the development database.");
  await prisma.roles.create({ data: {
    id: roleId, code: `NOTE_TEST_${run.slice(0, 8)}`, name: "Temporary transition-note integration role",
    role_access_scopes: { create: { scope_code: "ASSIGNED_ONLY" } },
    role_institution_programs: { create: { institution_program_id: programId } },
    role_permissions: { create: permissions.map((permission) => ({ permission_id: permission.id })) },
    user_roles: { create: { user_id: userId } },
  } });
  assert.equal((await request(configurationPath)).status, 200);
  const alreadySelected = await request(`/leads/${leadId}/open`, { method: "POST" });
  assert.equal(alreadySelected.status, 200);
  assert.equal(alreadySelected.payload.changed, false);
  assert.equal((await request(`/leads/${randomUUID()}/open`, { method: "POST" })).status, 404);
  const runtime = await request(optionsPath);
  assert.equal(runtime.status, 200);
  assert.deepEqual(runtime.payload.templates, [{ id: templateId, content: "Còn phân vân học phí" }]);
  assert.equal((await request(`/leads/${randomUUID()}/transition-note-options?target=${nextStageId}`)).status, 404);
  assert.equal((await request(`${configurationPath}/${nextStageId}`, { method: "PUT", body: { templates: [{ id: templateId, content: "   ", isActive: true }] } })).status, 400);
  const invalidStage = await request(`/leads/${leadId}/stage`, { method: "PATCH", body: { stageId: nextStageId, noteTemplateId: failTemplateId } });
  assert.equal(invalidStage.status, 400);
  assert.equal((await snapshot()).pipeline_stage_id, firstStageId);
  const invalidFail = await request(`/leads/${leadId}/status`, { method: "PATCH", body: { status: "FAIL", noteTemplateId: templateId } });
  assert.equal(invalidFail.status, 400);
  assert.equal((await snapshot()).status, "ACTIVE");
  const optionsPermission = permissions.find((permission) => permission.code === "custom_field.lead.manage")!;
  await prisma.role_permissions.deleteMany({ where: { role_id: roleId, permission_id: optionsPermission.id } });
  assert.equal((await request(`${configurationPath}/${nextStageId}`, { method: "PUT", body: { templates: [] } })).status, 403, "Updating field requirements alone must not grant template management.");
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
}

async function main() {
  previousFailSetting = await prisma.system_settings.findUnique({ where: { key: transitionNoteSettingKey("FAIL") }, select: { value: true, type: true } });
  failSettingBackedUp = true;
  const program = await prisma.institution_programs.findFirstOrThrow({ where: { status: "active" }, select: { id: true } });
  await prisma.users.create({ data: { id: userId, email: actor.email, password_hash: "unused-in-service-test", full_name: actor.fullName } });
  await prisma.pipelines.create({ data: { id: pipelineId, name: `Transition test ${run}`, module: "sale", pipeline_stages: { create: [
    { id: firstStageId, name: "L1", position: 0 }, { id: nextStageId, name: "L3", position: 1 },
  ] } } });
  await prisma.lead_sources.create({ data: { id: sourceId, name: `Transition test ${run}` } });
  await prisma.leads.create({ data: { id: leadId, full_name: "Lead kiểm thử ghi chú", phone: `09${Date.now().toString().slice(-8)}`, assigned_to: userId, source_id: sourceId, institution_program_id: program.id, pipeline_stage_id: firstStageId, note: "Ghi chú cũ" } });

  assert.equal((await setTransitionNoteTemplates(actor, randomUUID(), [])).ok, false);
  assert.equal((await setTransitionNoteTemplates(actor, nextStageId, [
    { id: templateId, content: "Còn phân vân học phí", isActive: true },
    { id: disabledId, content: "Tạm ngừng", isActive: false },
  ])).ok, true);
  assert.equal((await setTransitionNoteTemplates(actor, "FAIL", [{ id: failTemplateId, content: "Sai đối tượng", isActive: true }])).ok, true);
  await verifyHttpAccess(program.id);
  const configuration = await getTransitionNoteConfiguration();
  assert.equal(configuration.find((item) => item.target === nextStageId)?.templates.length, 2);
  const options = await getVisibleTransitionNoteOptions(actor, leadId, nextStageId);
  assert.ok(options.ok);
  assert.deepEqual(options.data.templates, [{ id: templateId, content: "Còn phân vân học phí" }]);
  assert.equal((await getVisibleTransitionNoteOptions({ ...actor, id: outsiderId }, leadId, nextStageId)).ok, false);
  assert.equal((await getVisibleTransitionNoteOptions(actor, leadId, nextStageId, randomUUID())).ok, false);

  const before = await snapshot();
  assert.equal((await changeVisibleLeadStage({ ...actor, permissions: [] }, leadId, nextStageId)).ok, false);
  assert.equal((await changeVisibleLeadStage({ ...actor, id: outsiderId }, leadId, nextStageId, undefined, undefined, undefined, templateId)).ok, false);
  for (const invalidId of [randomUUID(), disabledId, failTemplateId]) {
    const result = await changeVisibleLeadStage(actor, leadId, nextStageId, undefined, undefined, undefined, invalidId);
    assert.deepEqual(result, { ok: false, reason: "note_template_invalid" });
    assert.deepEqual(await snapshot(), before, "Invalid template must not change the lead, notes, timeline or history.");
  }
  await assert.rejects(changeVisibleLeadStage(actor, leadId, nextStageId, undefined, async () => { throw new Error("Rollback probe"); }, undefined, templateId), /Rollback probe/);
  assert.deepEqual(await snapshot(), before, "A transaction failure must roll back stage and note together.");

  assert.equal((await changeVisibleLeadStage(actor, leadId, nextStageId, undefined, undefined, undefined, templateId)).ok, true);
  let current = await snapshot();
  assert.equal(current.note, "L3 | Còn phân vân học phí");
  assert.equal(current._count.lead_notes, 1);
  assert.equal(current._count.lead_status_histories, 1);
  const detail = await getLeadDetail(actor, leadId);
  assert.equal(detail?.notes[0].content, current.note);
  assert.ok(detail?.activities.some((item) => item.type === "note_created" && item.content === current.note));
  assert.equal(await prisma.audit_logs.count({ where: { entity_id: leadId, action: "note_created" } }), 1);
  await changeVisibleLeadStage(actor, leadId, nextStageId, undefined, undefined, undefined, templateId);
  assert.deepEqual(await snapshot(), current, "Selecting the current stage must not duplicate notes.");

  await setTransitionNoteTemplates(actor, nextStageId, [{ id: templateId, content: "Mẫu đã sửa", isActive: true }]);
  await prisma.pipeline_stages.update({ where: { id: nextStageId }, data: { name: "L3 - Đã đổi tên" } });
  assert.equal((await prisma.lead_notes.findFirstOrThrow({ where: { lead_id: leadId } })).content, "L3 | Còn phân vân học phí");

  assert.deepEqual(await changeVisibleLeadStatus(actor, leadId, "FAIL", undefined, undefined, templateId), { ok: false, reason: "note_template_invalid" });
  assert.deepEqual(await snapshot(), current);
  assert.equal((await changeVisibleLeadStatus(actor, leadId, "FAIL", undefined, undefined, failTemplateId)).ok, true);
  current = await snapshot();
  assert.equal(current.note, "Fail | Sai đối tượng");
  assert.equal(current.status, `FAIL:${nextStageId}`);
  assert.equal(current.pipeline_stage_id, null);
  assert.equal(current._count.lead_notes, 2);
  await changeVisibleLeadStatus(actor, leadId, "FAIL", undefined, undefined, failTemplateId);
  assert.deepEqual(await snapshot(), current);
  await changeVisibleLeadStatus(actor, leadId, "ACTIVE");
  await changeVisibleLeadStage(actor, leadId, firstStageId);
  current = await snapshot();
  assert.equal(current.note, "Fail | Sai đối tượng", "Skipping a note must preserve existing note text.");
  assert.equal(current._count.lead_notes, 2);

  const lead = await prisma.leads.findUniqueOrThrow({ where: { id: leadId }, select: { phone: true } });
  const formResult = await updateLead(actor, leadId, { fullName: "Lead kiểm thử ghi chú", phone: lead.phone, sourceId, pipelineStageId: nextStageId, noteTemplateId: templateId });
  assert.ok(formResult.ok);
  assert.equal((await snapshot()).note, "L3 | Mẫu đã sửa", "Full lead edit must use the same formatting and transaction.");
  await changeVisibleLeadStatus(actor, leadId, "FAIL");
  assert.equal((await snapshot())._count.lead_notes, 3, "Fail without a template must remain optional.");
  assert.ok(await prisma.audit_logs.count({ where: { user_id: userId, entity_type: "lead_transition_note_configuration" } }));
  const manualFail = await addLeadNote(actor, leadId, "  Gọi lại ngày mai  ");
  assert.ok(manualFail.ok);
  assert.equal((await prisma.lead_notes.findUniqueOrThrow({ where: { id: manualFail.data.id } })).content, "Fail | Gọi lại ngày mai");
  assert.equal((await addLeadNote({ ...actor, id: outsiderId }, leadId, "Không được lưu")).ok, false);
  await changeVisibleLeadStatus(actor, leadId, "ACTIVE");
  const manualStage = await addLeadNote(actor, leadId, "Hẹn gọi lại lúc 3:33");
  assert.ok(manualStage.ok);
  assert.equal((await prisma.lead_notes.findUniqueOrThrow({ where: { id: manualStage.data.id } })).content, "L3 | Hẹn gọi lại lúc 3:33");
  await changeVisibleLeadStage(actor, leadId, firstStageId);
  const beforeInvalidContent = await snapshot();
  for (const content of [" ", "x".repeat(1801)]) {
    assert.equal((await changeVisibleLeadStage(actor, leadId, nextStageId, undefined, undefined, undefined, templateId, content)).ok, false);
    assert.deepEqual(await snapshot(), beforeInvalidContent);
  }
  assert.equal((await changeVisibleLeadStage(actor, leadId, nextStageId, undefined, undefined, undefined, undefined, "Không chọn mẫu")).ok, false);
  assert.equal((await changeVisibleLeadStage(actor, leadId, nextStageId, undefined, undefined, undefined, templateId, "Mẫu đã sửa, hẹn trao đổi với phụ huynh")).ok, true);
  assert.equal((await snapshot()).note, "L3 | Mẫu đã sửa, hẹn trao đổi với phụ huynh");
  assert.equal((await getVisibleTransitionNoteOptions(actor, leadId, nextStageId)).ok, true);
  assert.equal((await getTransitionNoteConfiguration()).find((item) => item.target === nextStageId)?.templates[0].content, "Mẫu đã sửa");
  assert.equal((await changeVisibleLeadStatus(actor, leadId, "FAIL", undefined, undefined, failTemplateId, "Sai đối tượng, cần học chương trình khác")).ok, true);
  assert.equal((await snapshot()).note, "Fail | Sai đối tượng, cần học chương trình khác");
  await prisma.leads.update({ where: { id: leadId }, data: { status: "ACTIVE", pipeline_stage_id: null } });
  const noStage = await addLeadNote(actor, leadId, "Chờ tư vấn");
  assert.ok(noStage.ok);
  assert.equal((await prisma.lead_notes.findUniqueOrThrow({ where: { id: noStage.data.id } })).content, "Chưa chọn tiến trình | Chờ tư vấn");
  const editedForm = await updateLead(actor, leadId, { fullName: "Lead kiểm thử ghi chú", phone: lead.phone, sourceId, pipelineStageId: nextStageId, noteTemplateId: templateId, noteContent: "Nội dung bổ sung từ form" });
  assert.ok(editedForm.ok);
  assert.equal((await snapshot()).note, "L3 | Nội dung bổ sung từ form");
  assert.equal((await initializeLeadOnOpen(actor, leadId)).ok, true);
  const beforeOpen = await snapshot();
  await prisma.leads.update({ where: { id: leadId }, data: { pipeline_stage_id: null } });
  assert.equal((await initializeLeadOnOpen({ ...actor, permissions: [] }, leadId)).ok, false);
  assert.equal((await initializeLeadOnOpen({ ...actor, id: outsiderId }, leadId)).ok, false);
  assert.equal((await initializeLeadOnOpen(actor, leadId, randomUUID())).ok, false);
  const otherViewer = await initializeLeadOnOpen({ ...actor, id: outsiderId, accessScope: "ALL", permissions: ["lead.view_all", "lead.update_all"] }, leadId);
  assert.deepEqual(otherViewer, { ok: true, data: { id: leadId, changed: false } });
  const ambiguousStageId = randomUUID();
  await prisma.pipeline_stages.create({ data: { id: ambiguousStageId, pipeline_id: pipelineId, name: "L0 - Kiểm thử trùng cấu hình" } });
  const beforeAmbiguousOpen = await snapshot();
  assert.deepEqual(await initializeLeadOnOpen(actor, leadId), { ok: false, reason: "initial_stage_unavailable" });
  assert.deepEqual(await snapshot(), beforeAmbiguousOpen, "Ambiguous L0 configuration must not guess or mutate the lead.");
  await prisma.pipeline_stages.delete({ where: { id: ambiguousStageId } });
  const concurrentOpens = await Promise.all([initializeLeadOnOpen(actor, leadId), initializeLeadOnOpen(actor, leadId)]);
  assert.ok(concurrentOpens.every((result) => result.ok), JSON.stringify(concurrentOpens));
  assert.equal(concurrentOpens.filter((result) => result.ok && result.data.changed).length, 1);
  const afterOpen = await snapshot();
  const openedStage = await prisma.pipeline_stages.findUniqueOrThrow({ where: { id: afterOpen.pipeline_stage_id! }, select: { name: true } });
  assert.match(openedStage.name, /\bL0\b/i);
  assert.equal(afterOpen._count.lead_status_histories, beforeOpen._count.lead_status_histories + 1);
  assert.equal(afterOpen._count.lead_notes, beforeOpen._count.lead_notes, "Opening must not require or create a template note.");
  assert.deepEqual(await initializeLeadOnOpen(actor, leadId), { ok: true, data: { id: leadId, changed: false } });
  await prisma.leads.update({ where: { id: leadId }, data: { pipeline_stage_id: null, status: `FAIL:${nextStageId}` } });
  assert.deepEqual(await initializeLeadOnOpen(actor, leadId), { ok: true, data: { id: leadId, changed: false } });
  await prisma.leads.update({ where: { id: leadId }, data: { pipeline_stage_id: null, status: "ACTIVE", assigned_to: null } });
  assert.deepEqual(await initializeLeadOnOpen({ ...actor, accessScope: "ALL", permissions: ["lead.view_all", "lead.update_all"] }, leadId), { ok: true, data: { id: leadId, changed: false } });
  console.log("Transition note and lead-open integration passed, including owner checks and concurrent L0 initialization.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  if (failSettingBackedUp) {
    if (previousFailSetting) await prisma.system_settings.upsert({ where: { key: transitionNoteSettingKey("FAIL") }, create: { key: transitionNoteSettingKey("FAIL"), ...previousFailSetting }, update: previousFailSetting });
    else await prisma.system_settings.deleteMany({ where: { key: transitionNoteSettingKey("FAIL") } });
  }
  await prisma.audit_logs.deleteMany({ where: { user_id: userId } });
  await prisma.leads.deleteMany({ where: { id: leadId } });
  await prisma.system_settings.deleteMany({ where: { key: { in: [transitionNoteSettingKey(firstStageId), transitionNoteSettingKey(nextStageId)] } } });
  await prisma.pipeline_stages.deleteMany({ where: { pipeline_id: pipelineId } });
  await prisma.pipelines.deleteMany({ where: { id: pipelineId } });
  await prisma.lead_sources.deleteMany({ where: { id: sourceId } });
  await prisma.user_roles.deleteMany({ where: { role_id: roleId } });
  await prisma.roles.deleteMany({ where: { id: roleId } });
  await prisma.users.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
  redisCommandConnection?.disconnect();
  redisConnection?.disconnect();
});
