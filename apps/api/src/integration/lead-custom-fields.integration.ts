import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";

import { app } from "../app";
import { prisma } from "../database/prisma";
import type { Prisma } from "../generated/prisma/client";

type JsonRecord = Record<string, unknown>;
type FieldResponse = { id: string; value: unknown; canView: boolean; canEdit: boolean };

const runId = randomUUID().replaceAll("-", "_");
const password = `Custom-${runId}`;
const userIds: string[] = [];
const roleIds: string[] = [];
const leadIds: string[] = [];
const fieldIds: string[] = [];
const programIds: string[] = [];
let institutionId: string | null = null;
let programTypeId: string | null = null;
let assertions = 0;

function check(condition: unknown, message: string) {
  assertions += 1;
  assert.ok(condition, message);
}

function equal(actual: unknown, expected: unknown, message: string) {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
}

async function request(baseUrl: string, path: string, token: string, method = "GET", body?: JsonRecord) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: (await response.json().catch(() => ({}))) as JsonRecord };
}

async function ensurePermission(code: string) {
  return prisma.permissions.upsert({
    where: { code },
    update: { is_active: true },
    create: { code, name: code, module: code.split(".")[0], is_active: true },
    select: { id: true },
  });
}

async function createActor(label: string, permissions: string[], scope: "ALL" | "ASSIGNED_ONLY") {
  const role = await prisma.roles.create({
    data: { code: `CF_${label}_${runId}`.toUpperCase(), name: `Custom Field ${label}` },
    select: { id: true },
  });
  roleIds.push(role.id);
  const permissionRows = await Promise.all(permissions.map(ensurePermission));
  await prisma.role_permissions.createMany({
    data: permissionRows.map((permission) => ({ role_id: role.id, permission_id: permission.id })),
  });
  const email = `cf.${label}.${runId}@example.test`;
  const user = await prisma.users.create({
    data: { email, password_hash: await hash(password, 10), full_name: `Custom Field ${label}`, status: "active" },
    select: { id: true },
  });
  userIds.push(user.id);
  await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
  await prisma.user_access_scopes.create({ data: { user_id: user.id, scope } });
  return { id: user.id, email };
}

async function login(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json()) as JsonRecord;
  equal(response.status, 200, `Đăng nhập ${email} phải thành công.`);
  check(typeof payload.accessToken === "string", "Login phải trả access token.");
  return payload.accessToken as string;
}

async function createField(input: {
  key: string;
  type?: string;
  scope?: "GLOBAL" | "PROGRAM";
  programId?: string;
  active?: boolean;
  archived?: boolean;
  sensitive?: boolean;
  validationRules?: Prisma.InputJsonObject;
}) {
  const field = await prisma.custom_fields.create({
    data: {
      module: "LEAD",
      field_key: `${input.key}_${runId}`,
      field_label: input.key,
      field_type: input.type ?? "TEXT",
      entity_type: "LEAD",
      group_id: "10000000-0000-4000-8000-000000000007",
      scope_type: input.scope ?? "GLOBAL",
      program_id: input.programId,
      is_active: input.active ?? true,
      archived_at: input.archived ? new Date() : null,
      is_required: false,
      is_sensitive: input.sensitive ?? false,
      validation_rules: input.validationRules,
    },
    select: { id: true },
  });
  fieldIds.push(field.id);
  return field.id;
}

function fields(payload: JsonRecord) {
  return Array.isArray(payload.fields) ? payload.fields as FieldResponse[] : [];
}

async function cleanup() {
  await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { entity_id: { in: leadIds } }] } });
  await prisma.custom_field_values.deleteMany({ where: { OR: [{ custom_field_id: { in: fieldIds } }, { entity_id: { in: leadIds } }] } });
  await prisma.custom_fields.deleteMany({ where: { id: { in: fieldIds } } });
  await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.user_access_scopes.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  await prisma.role_permissions.deleteMany({ where: { role_id: { in: roleIds } } });
  await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
  await prisma.institution_programs.deleteMany({ where: { id: { in: programIds } } });
  if (institutionId) await prisma.institutions.deleteMany({ where: { id: institutionId } });
  if (programTypeId) await prisma.program_types.deleteMany({ where: { id: programTypeId } });
}

async function main() {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const full = await createActor("full", ["lead.view_all", "lead.update_all", "custom_field.view", "custom_field.view_sensitive", "custom_field.edit_sensitive"], "ALL");
    const limited = await createActor("limited", ["lead.view_all", "lead.update_all", "custom_field.view"], "ALL");
    const noCustom = await createActor("no_custom", ["lead.view_all", "lead.update_all"], "ALL");
    const creator = await createActor("creator", ["lead.create"], "ALL");
    const noUpdate = await createActor("no_update", ["lead.view_all", "custom_field.view", "custom_field.update"], "ALL");
    const outside = await createActor("outside", ["lead.view_assigned", "lead.update_assigned", "custom_field.view"], "ASSIGNED_ONLY");
    const [fullToken, limitedToken, noCustomToken, creatorToken, noUpdateToken, outsideToken] = await Promise.all([
      login(baseUrl, full.email), login(baseUrl, limited.email), login(baseUrl, noCustom.email), login(baseUrl, creator.email), login(baseUrl, noUpdate.email), login(baseUrl, outside.email),
    ]);

    const institution = await prisma.institutions.create({ data: { code: `INST_${runId}`, name: "Integration Institution" }, select: { id: true } });
    institutionId = institution.id;
    const programType = await prisma.program_types.create({ data: { code: `TYPE_${runId}`, name: "Integration Type" }, select: { id: true } });
    programTypeId = programType.id;
    for (const suffix of ["A", "B"]) {
      const program = await prisma.institution_programs.create({ data: { institution_id: institution.id, program_type_id: programType.id, code: `PROGRAM_${suffix}_${runId}`, name: `Program ${suffix}` }, select: { id: true } });
      programIds.push(program.id);
    }
    const lead = await prisma.leads.create({ data: { full_name: "Scoped Lead", phone: `09${Date.now().toString().slice(-8)}`, assigned_to: full.id, owner_id: full.id, institution_program_id: programIds[0] }, select: { id: true } });
    const noProgramLead = await prisma.leads.create({ data: { full_name: "Global Lead", phone: `08${Date.now().toString().slice(-8)}`, assigned_to: full.id, owner_id: full.id }, select: { id: true } });
    leadIds.push(lead.id, noProgramLead.id);

    const globalId = await createField({ key: "global" });
    const programAId = await createField({ key: "program_a", scope: "PROGRAM", programId: programIds[0] });
    const programBId = await createField({ key: "program_b", scope: "PROGRAM", programId: programIds[1] });
    const inactiveId = await createField({ key: "inactive", active: false });
    const archivedId = await createField({ key: "archived", archived: true });
    const sensitiveId = await createField({ key: "sensitive", sensitive: true });
    const rollbackNumberId = await createField({ key: "rollback_number", type: "NUMBER" });
    const provinceId = await createField({ key: "province", type: "PROVINCE" });
    const fileId = await createField({ key: "file", type: "FILE", validationRules: { maxFiles: 5 } });

    const scopedGet = await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken);
    equal(scopedGet.status, 200, "Actor đúng scope phải đọc được Lead.");
    const scopedIds = new Set(fields(scopedGet.payload).map((field) => field.id));
    check(scopedIds.has(globalId), "GET phải trả GLOBAL field.");
    check(scopedIds.has(programAId), "GET phải trả PROGRAM field đúng program.");
    check(!scopedIds.has(programBId), "GET không được trả PROGRAM field khác program.");
    check(!scopedIds.has(inactiveId), "GET không được trả field inactive.");
    check(!scopedIds.has(archivedId), "GET không được trả field archived.");
    const globalOnlyIds = new Set(fields((await request(baseUrl, `/leads/${noProgramLead.id}/custom-fields`, fullToken)).payload).map((field) => field.id));
    check(globalOnlyIds.has(globalId) && !globalOnlyIds.has(programAId), "Lead không có program chỉ nhận GLOBAL field.");
    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, outsideToken)).status, 404, "Actor ngoài scope không được GET.");
    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, outsideToken, "PATCH", { values: [{ fieldId: globalId, value: "blocked" }] })).status, 404, "Actor ngoài scope không được PATCH.");
    const oldLeadResponse = await request(baseUrl, `/leads/${lead.id}/custom-fields`, noCustomToken);
    equal(oldLeadResponse.status, 200, "Quyền xem Lead phải được đọc custom field mà không cần quyền quản trị cấu hình.");
    const oldLeadGlobalField = fields(oldLeadResponse.payload).find((field) => field.id === globalId);
    check(oldLeadGlobalField?.value === null, "Lead được tạo trước custom field vẫn phải hiển thị field mới với giá trị rỗng.");
    check(oldLeadGlobalField?.canEdit, "Người có quyền cập nhật Lead phải chỉnh sửa được field mới trên Lead cũ.");
    const createDefinitions = await request(baseUrl, `/leads/custom-fields?institutionProgramId=${programIds[0]}`, creatorToken);
    equal(createDefinitions.status, 200, "Quyền tạo Lead phải được tải custom field mà không cần quyền quản trị cấu hình.");
    const createDefinitionIds = new Set(fields(createDefinitions.payload).map((field) => field.id));
    check(createDefinitionIds.has(globalId) && createDefinitionIds.has(programAId), "Form tạo Lead phải nhận field GLOBAL và field đúng chương trình.");
    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, noUpdateToken, "PATCH", { values: [{ fieldId: globalId, value: "blocked" }] })).status, 403, "custom_field.update không thay quyền sửa Lead.");

    const fileValue = [
      { name: "hoc-ba-1.jpg", size: 2048, type: "image/jpeg", lastModified: 1786492800000 },
      { name: "hoc-ba-2.png", size: 4096, type: "image/png", lastModified: 1786492800001 },
    ];
    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken, "PATCH", { values: [{ fieldId: provinceId, value: "tra_vinh" }] })).status, 400, "Old province codes must be rejected.");
    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken, "PATCH", { values: [{ fieldId: provinceId, value: "vinh_long" }, { fieldId: fileId, value: fileValue }] })).status, 200, "Province and file metadata must be saved.");
    const typedFields = fields((await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken)).payload);
    equal(typedFields.find((field) => field.id === provinceId)?.value, "vinh_long", "Province field must read back the saved province code.");
    equal(typedFields.find((field) => field.id === fileId)?.value, fileValue, "File field must read back the saved metadata.");
    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken, "PATCH", { values: [{ fieldId: fileId, value: Array.from({ length: 6 }, (_, index) => ({ name: `over-${index}.jpg`, size: 1024, type: "image/jpeg", lastModified: 1786492800100 + index })) }] })).status, 400, "File field must reject values over the configured max.");
    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken, "PATCH", { values: [{ fieldId: fileId, value: [{ name: "hoc-ba.pdf", size: 2048, type: "application/pdf", lastModified: 1786492800002, dataUrl: "data:application/pdf;base64,JVBERi0x" }] }] })).status, 200, "File field must allow non-image files for download-only usage.");

    const secretOne = `secret-one-${runId}`;
    const secretTwo = `secret-two-${runId}`;
    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken, "PATCH", { values: [{ fieldId: sensitiveId, value: secretOne }] })).status, 200, "Actor đủ quyền phải sửa được sensitive field.");
    const hidden = fields((await request(baseUrl, `/leads/${lead.id}/custom-fields`, limitedToken)).payload).find((field) => field.id === sensitiveId);
    check(hidden && hidden.value === null && hidden.canView === false && hidden.canEdit === false, "Sensitive response phải bị ẩn khi thiếu quyền.");
    const visible = fields((await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken)).payload).find((field) => field.id === sensitiveId);
    check(visible && visible.value === secretOne && visible.canView && visible.canEdit, "Actor đủ quyền phải xem được sensitive value.");
    const deniedSensitive = await request(baseUrl, `/leads/${lead.id}/custom-fields`, limitedToken, "PATCH", { values: [{ fieldId: sensitiveId, value: secretTwo }] });
    equal(deniedSensitive.status, 403, "Thiếu edit_sensitive phải bị từ chối.");
    check(!JSON.stringify(deniedSensitive.payload).includes(secretTwo), "Error response không được chứa secret.");
    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken, "PATCH", { values: [{ fieldId: sensitiveId, value: secretTwo }] })).status, 200, "Update sensitive phải thành công.");
    const sensitiveAudits = await prisma.audit_logs.findMany({ where: { entity_type: "lead_custom_field", entity_id: lead.id, new_data: { path: ["fieldId"], equals: sensitiveId } }, select: { old_data: true, new_data: true } });
    check(sensitiveAudits.length >= 2, "Phải có audit create/update sensitive.");
    const auditText = JSON.stringify(sensitiveAudits);
    check(!auditText.includes(secretOne) && !auditText.includes(secretTwo), "Audit sensitive không được chứa raw value.");
    check(auditText.includes("redacted") && auditText.includes("hasValue"), "Audit sensitive phải chứa metadata redacted.");

    equal((await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken, "PATCH", { values: [{ fieldId: globalId, value: "old-value" }] })).status, 200, "Chuẩn bị rollback fixture phải thành công.");
    const auditBefore = await prisma.audit_logs.count({ where: { entity_type: "lead_custom_field", entity_id: lead.id } });
    const valueCountBefore = await prisma.custom_field_values.count({ where: { entity_type: "LEAD", entity_id: lead.id } });
    const rollback = await request(baseUrl, `/leads/${lead.id}/custom-fields`, fullToken, "PATCH", { values: [{ fieldId: globalId, value: "new-value" }, { fieldId: rollbackNumberId, value: "not-a-number" }] });
    equal(rollback.status, 400, "Batch có field sai phải thất bại.");
    const unchanged = await prisma.custom_field_values.findUniqueOrThrow({ where: { custom_field_id_entity_type_entity_id: { custom_field_id: globalId, entity_type: "LEAD", entity_id: lead.id } }, select: { value_text: true } });
    equal(unchanged.value_text, "old-value", "Field hợp lệ trong batch không được lưu một phần.");
    equal(await prisma.custom_field_values.count({ where: { entity_type: "LEAD", entity_id: lead.id } }), valueCountBefore, "Rollback không được tạo value thừa.");
    equal(await prisma.audit_logs.count({ where: { entity_type: "lead_custom_field", entity_id: lead.id } }), auditBefore, "Rollback không được tạo audit thừa.");

    console.log(`Lead custom field integration passed: ${assertions} assertions.`);
  } finally {
    await cleanup();
    server.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
