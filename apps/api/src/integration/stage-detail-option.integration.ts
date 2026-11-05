import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { prisma } from "../database/prisma";
import { redisCommandConnection, redisConnection } from "../config/redis";
import { createAuthSession } from "../modules/auth/auth-session.service";
import { customFieldsRouter } from "../modules/custom-fields/custom-fields.router";
import { leadsRouter } from "../modules/leads/leads.router";
import type { AuthUser } from "../modules/auth/auth.types";
import { changeVisibleLeadStage, changeVisibleLeadStatus } from "../modules/leads/application/lead-owner-stage.use-cases";
import { updateLead } from "../modules/leads/application/update-lead.use-case";
import { addLeadNote } from "../modules/leads/application/lead-collaboration.use-cases";
import { getLeadDetail } from "../modules/leads/lead-list.service";
import { getStageDetailConfiguration, getVisibleStageDetailOptions, setStageDetailOptions, stageDetailSettingKey } from "../modules/leads/stage-detail-option.service";

const run = randomUUID();
const userId = randomUUID();
const outsiderId = randomUUID();
const leadId = randomUUID();
const sourceId = randomUUID();
const pipelineId = randomUUID();
const firstStageId = randomUUID();
const nextStageId = randomUUID();
const thirdStageId = randomUUID();
const tuitionOptionId = randomUUID();
const tuitionChildId = randomUUID();
const failOptionId = randomUUID();
const invalidProfileOptionId = randomUUID();
const wrongNameChildId = randomUUID();
const roleId = randomUUID();
let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
const actor: AuthUser = { id: userId, email: `stage-detail.${run}@example.test`, fullName: "Kiểm thử trường nhiều cấp", avatarUrl: null, roles: [], permissions: ["lead.update_assigned", "lead.view_assigned", "custom_field.lead.manage"], departmentIds: [], institutionProgramIds: [], accessScope: "ASSIGNED_ONLY" };
let previousFailSetting: { value: string | null; type: string | null } | null = null;
let failSettingBackedUp = false;

async function snapshot() {
  return prisma.leads.findUniqueOrThrow({ where: { id: leadId }, select: {
    status: true, pipeline_stage_id: true, note: true,
    _count: { select: { lead_notes: true, lead_status_histories: true, lead_activities: true } },
  } });
}

async function latestStageActivity() {
  return (await prisma.lead_activities.findFirstOrThrow({
    where: { lead_id: leadId, type: "pipeline_stage_changed" },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: { content: true },
  })).content;
}

async function verifyHttpAccess(programId: string) {
  const app = express();
  app.use(express.json());
  app.use("/api/custom-fields", customFieldsRouter);
  app.use("/api/leads", leadsRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  // Access tokens must belong to an active session; a bare signed JWT is rejected.
  const session = await createAuthSession(userId, "unused-in-service-test", false);
  assert.ok(session, "The test user must be able to open a session.");
  const token = session.accessToken;
  async function request(path: string, options: { method?: string; body?: unknown; authenticated?: boolean } = {}) {
    const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: {
      "Content-Type": "application/json", Connection: "close", "X-Institution-Program-Id": programId,
      ...(options.authenticated === false ? {} : { Authorization: `Bearer ${token}` }),
    }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    return { status: response.status, payload: await response.json() as any };
  }
  const configurationPath = "/custom-fields/system/LEAD/stage-detail-options";
  const optionsPath = `/leads/${leadId}/stage-detail-options?target=${nextStageId}`;
  assert.equal((await request(configurationPath, { authenticated: false })).status, 401);
  assert.equal((await request(optionsPath, { authenticated: false })).status, 401);
  assert.equal((await request(`/leads/${leadId}/open`, { method: "POST", authenticated: false })).status, 401);
  assert.equal((await request(`/leads/${leadId}/open`, { method: "POST" })).status, 403);
  assert.equal((await request(configurationPath)).status, 403, "Authenticated users without configuration permissions must be denied.");
  assert.equal((await request(optionsPath)).status, 403);

  const permissions = await prisma.permissions.findMany({ where: { code: { in: actor.permissions } }, select: { id: true, code: true } });
  assert.equal(permissions.length, actor.permissions.length, "Required permissions must already exist in the development database.");
  await prisma.roles.create({ data: {
    id: roleId, code: `STAGE_DETAIL_${run.slice(0, 8)}`, name: "Temporary stage-detail integration role",
    role_access_scopes: { create: { scope_code: "ASSIGNED_ONLY" } },
    role_institution_programs: { create: { institution_program_id: programId } },
    role_permissions: { create: permissions.map((permission) => ({ permission_id: permission.id })) },
  } });
  // Roles are granted per institution program.
  await prisma.user_program_roles.create({ data: { user_id: userId, role_id: roleId, institution_program_id: programId } });
  assert.equal((await request(configurationPath)).status, 200);
  const alreadySelected = await request(`/leads/${leadId}/open`, { method: "POST" });
  assert.equal(alreadySelected.status, 200);
  assert.equal(alreadySelected.payload.changed, false);
  assert.equal((await request(`/leads/${randomUUID()}/open`, { method: "POST" })).status, 404);
  const runtime = await request(optionsPath);
  assert.equal(runtime.status, 200);
  assert.deepEqual(runtime.payload.options.map((item: { id: string }) => item.id), [tuitionOptionId]);
  assert.equal((await request(`/leads/${randomUUID()}/stage-detail-options?target=${nextStageId}`)).status, 404);
  assert.equal((await request(`${configurationPath}/${nextStageId}`, { method: "PUT", body: { options: [{ id: tuitionOptionId, label: "   ", children: [] }] } })).status, 400);
  const invalidStage = await request(`/leads/${leadId}/stage`, { method: "PATCH", body: { stageId: nextStageId, stageDetail: { optionId: failOptionId } } });
  assert.equal(invalidStage.status, 400);
  assert.equal((await snapshot()).pipeline_stage_id, firstStageId);
  const invalidFail = await request(`/leads/${leadId}/status`, { method: "PATCH", body: { status: "FAIL", stageDetail: { optionId: tuitionOptionId } } });
  assert.equal(invalidFail.status, 400);
  assert.equal((await snapshot()).status, "ACTIVE");
  const optionsPermission = permissions.find((permission) => permission.code === "custom_field.lead.manage")!;
  await prisma.role_permissions.deleteMany({ where: { role_id: roleId, permission_id: optionsPermission.id } });
  assert.equal((await request(`${configurationPath}/${nextStageId}`, { method: "PUT", body: { options: [] } })).status, 403, "Updating field requirements alone must not grant option management.");
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
}

async function main() {
  previousFailSetting = await prisma.system_settings.findUnique({ where: { key: stageDetailSettingKey("FAIL") }, select: { value: true, type: true } });
  failSettingBackedUp = true;
  const program = await prisma.institution_programs.findFirstOrThrow({ where: { status: "active" }, select: { id: true } });
  await prisma.users.create({ data: { id: userId, email: actor.email, password_hash: "unused-in-service-test", full_name: actor.fullName } });
  await prisma.pipelines.create({ data: { id: pipelineId, name: `Stage detail test ${run}`, module: "sale", pipeline_stages: { create: [
    { id: firstStageId, name: "L1", position: 0 }, { id: nextStageId, name: "L3", position: 1 }, { id: thirdStageId, name: "L5", position: 2 },
  ] } } });
  await prisma.lead_sources.create({ data: { id: sourceId, name: `Stage detail test ${run}`, institution_program_id: program.id } });
  await prisma.leads.create({ data: { id: leadId, full_name: "Lead kiểm thử nhiều cấp", phone: `09${Date.now().toString().slice(-8)}`, assigned_to: userId, source_id: sourceId, institution_program_id: program.id, pipeline_stage_id: firstStageId, note: "Ghi chú cũ" } });

  assert.equal((await setStageDetailOptions(actor, randomUUID(), [])).ok, false);
  assert.equal((await setStageDetailOptions(actor, nextStageId, [
    { id: tuitionOptionId, label: "Còn phân vân học phí", children: [{ id: tuitionChildId, label: "Hẹn gọi lại" }] },
  ])).ok, true);
  assert.equal((await setStageDetailOptions(actor, "FAIL", [
    { id: failOptionId, label: "Sai đối tượng", children: [] },
    { id: invalidProfileOptionId, label: "Hồ sơ không hợp lệ", children: [{ id: wrongNameChildId, label: "Sai tên" }] },
  ])).ok, true);
  await verifyHttpAccess(program.id);
  const configuration = await getStageDetailConfiguration();
  assert.equal(configuration.find((item) => item.target === nextStageId)?.options[0].children.length, 1);
  assert.ok(configuration.some((item) => item.target === "FAIL"));
  assert.ok((await getVisibleStageDetailOptions(actor, leadId, nextStageId)).ok);
  assert.equal((await getVisibleStageDetailOptions({ ...actor, id: outsiderId }, leadId, nextStageId)).ok, false);
  assert.equal((await getVisibleStageDetailOptions(actor, leadId, nextStageId, randomUUID())).ok, false);

  const before = await snapshot();
  assert.equal((await changeVisibleLeadStage({ ...actor, permissions: [] }, leadId, nextStageId)).ok, false);
  assert.equal((await changeVisibleLeadStage({ ...actor, id: outsiderId }, leadId, nextStageId, undefined, undefined, undefined, { optionId: tuitionOptionId })).ok, false);
  for (const selection of [{ optionId: randomUUID() }, { optionId: failOptionId }, { optionId: tuitionOptionId, childOptionId: wrongNameChildId }]) {
    const result = await changeVisibleLeadStage(actor, leadId, nextStageId, undefined, undefined, undefined, selection);
    assert.deepEqual(result, { ok: false, reason: "stage_detail_invalid" });
    assert.deepEqual(await snapshot(), before, "An invalid selection must not change the lead, timeline or history.");
  }
  await assert.rejects(changeVisibleLeadStage(actor, leadId, nextStageId, undefined, async () => { throw new Error("Rollback probe"); }, undefined, { optionId: tuitionOptionId }), /Rollback probe/);
  assert.deepEqual(await snapshot(), before, "A transaction failure must roll back the stage and its activity together.");

  // Level 2 + level 3: joined with " - ", appended to the stage activity, never written as a note.
  assert.equal((await changeVisibleLeadStage(actor, leadId, nextStageId, undefined, undefined, undefined, { optionId: tuitionOptionId, childOptionId: tuitionChildId })).ok, true);
  let current = await snapshot();
  assert.equal(current.note, "Ghi chú cũ", "The selected content must not overwrite the lead note.");
  assert.equal(current._count.lead_notes, 0);
  assert.equal(current._count.lead_status_histories, 1);
  assert.equal(await latestStageActivity(), "Chuyển lead sang giai đoạn L3 | Còn phân vân học phí - Hẹn gọi lại");
  const detail = await getLeadDetail(actor, leadId);
  assert.equal(detail?.pipelineStageNote, "Còn phân vân học phí - Hẹn gọi lại", "The content is shown under the field without a stage prefix.");
  assert.ok(!detail?.activities.some((item) => item.type === "note_created"), "No care-note activity is created any more.");
  await changeVisibleLeadStage(actor, leadId, nextStageId, undefined, undefined, undefined, { optionId: tuitionOptionId });
  assert.deepEqual(await snapshot(), current, "Selecting the current stage must not add history.");

  assert.deepEqual(await changeVisibleLeadStatus(actor, leadId, "FAIL", undefined, undefined, { optionId: tuitionOptionId }), { ok: false, reason: "stage_detail_invalid" });
  assert.deepEqual(await snapshot(), current);
  assert.equal((await changeVisibleLeadStatus(actor, leadId, "FAIL", undefined, undefined, { optionId: invalidProfileOptionId, childOptionId: wrongNameChildId })).ok, true);
  current = await snapshot();
  assert.equal(current.status, `FAIL:${nextStageId}`);
  assert.equal(current.pipeline_stage_id, null);
  assert.equal(current._count.lead_notes, 0);
  assert.equal(await latestStageActivity(), "Chuyển trạng thái lead sang Fail | L3 | Hồ sơ không hợp lệ - Sai tên");
  assert.equal((await getLeadDetail(actor, leadId))?.pipelineStageNote, "Hồ sơ không hợp lệ - Sai tên", "A failed lead shows the content chosen for Fail.");
  await changeVisibleLeadStatus(actor, leadId, "FAIL", undefined, undefined, { optionId: failOptionId });
  assert.deepEqual(await snapshot(), current);

  // Reactivating at a different stage than the one the lead failed from.
  assert.equal((await changeVisibleLeadStatus(actor, leadId, "ACTIVE", undefined, undefined, undefined, thirdStageId)).ok, true);
  current = await snapshot();
  assert.equal(current.status, "ACTIVE");
  assert.equal(current.pipeline_stage_id, thirdStageId);
  assert.equal(await latestStageActivity(), "Kích hoạt lại lead tại tiến trình L5.");
  await changeVisibleLeadStage(actor, leadId, firstStageId);

  // The full lead form uses the same rules: FAIL fails the lead, a stage reactivates it.
  const lead = await prisma.leads.findUniqueOrThrow({ where: { id: leadId }, select: { phone: true } });
  const formBase = { fullName: "Lead kiểm thử nhiều cấp", phone: lead.phone, sourceId, institutionProgramId: program.id };
  const formFail = await updateLead(actor, leadId, { ...formBase, pipelineStageId: "FAIL", stageDetail: { optionId: failOptionId, content: "Sai đối tượng, muốn học chương trình khác" } });
  assert.ok(formFail.ok, JSON.stringify(formFail));
  assert.equal((await snapshot()).status, `FAIL:${firstStageId}`);
  assert.equal(await latestStageActivity(), "Chuyển trạng thái lead sang Fail | L1 | Sai đối tượng, muốn học chương trình khác");
  const formReactivate = await updateLead(actor, leadId, { ...formBase, pipelineStageId: nextStageId, stageDetail: { optionId: tuitionOptionId } });
  assert.ok(formReactivate.ok, JSON.stringify(formReactivate));
  current = await snapshot();
  assert.equal(current.status, "ACTIVE");
  assert.equal(current.pipeline_stage_id, nextStageId);
  assert.equal(await latestStageActivity(), "Kích hoạt lại lead tại tiến trình L3 | Còn phân vân học phí");
  const beforeInvalidForm = await snapshot();
  assert.deepEqual(await updateLead(actor, leadId, { ...formBase, pipelineStageId: "FAIL", stageDetail: { optionId: tuitionOptionId } }), { ok: false, reason: "stage_detail_invalid" });
  assert.deepEqual(await snapshot(), beforeInvalidForm, "A rejected form transition must not save anything.");
  assert.ok(await prisma.audit_logs.count({ where: { user_id: userId, entity_type: "lead_stage_detail_configuration" } }));

  // Manual notes keep their stage prefix and stay scoped to the owner.
  const manualStage = await addLeadNote(actor, leadId, "  Hẹn gọi lại lúc 3:33  ");
  assert.ok(manualStage.ok);
  assert.equal((await prisma.lead_notes.findUniqueOrThrow({ where: { id: manualStage.data.id } })).content, "L3 | Hẹn gọi lại lúc 3:33");
  assert.equal((await addLeadNote({ ...actor, id: outsiderId }, leadId, "Không được lưu")).ok, false);

  console.log("Stage detail (multi-level field) integration passed: permissions, levels 2/3, Fail, reactivation, lead form and rollback.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  if (failSettingBackedUp) {
    if (previousFailSetting) await prisma.system_settings.upsert({ where: { key: stageDetailSettingKey("FAIL") }, create: { key: stageDetailSettingKey("FAIL"), ...previousFailSetting }, update: previousFailSetting });
    else await prisma.system_settings.deleteMany({ where: { key: stageDetailSettingKey("FAIL") } });
  }
  await prisma.audit_logs.deleteMany({ where: { user_id: userId } });
  await prisma.leads.deleteMany({ where: { id: leadId } });
  await prisma.system_settings.deleteMany({ where: { key: { in: [firstStageId, nextStageId, thirdStageId].map(stageDetailSettingKey) } } });
  await prisma.pipeline_stages.deleteMany({ where: { pipeline_id: pipelineId } });
  await prisma.pipelines.deleteMany({ where: { id: pipelineId } });
  await prisma.lead_sources.deleteMany({ where: { id: sourceId } });
  await prisma.user_program_roles.deleteMany({ where: { role_id: roleId } });
  await prisma.user_roles.deleteMany({ where: { role_id: roleId } });
  await prisma.roles.deleteMany({ where: { id: roleId } });
  await prisma.auth_sessions.deleteMany({ where: { user_id: userId } });
  await prisma.users.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
  redisCommandConnection?.disconnect();
  redisConnection?.disconnect();
});
