import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";
import { app } from "../app";
import { prisma } from "../database/prisma";

const run = randomUUID().slice(0, 8);
const codes = ["custom_field.view", "custom_field.create", "custom_field.update", "custom_field.archive", "custom_field.manage_options", "custom_field.view_sensitive", "custom_field.edit_sensitive", "custom_field.manage_groups"];
async function request(base: string, path: string, options: { token?: string; method?: string; body?: unknown; programId?: string } = {}) { const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.programId ? { "x-institution-program-id": options.programId } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) }); return { status: response.status, payload: await response.json().catch(() => ({})) as any }; }
async function login(base: string, email = "director@tvu.edu.vn") { const result = await request(base, "/auth/login", { method: "POST", body: { email, password: "123456" } }); assert.equal(result.status, 200); return result.payload.accessToken as string; }
async function main() {
  const role = await prisma.roles.findUniqueOrThrow({ where: { code: "DIRECTOR" } });
  const saleRole = await prisma.roles.upsert({ where: { code: "SALE_MANAGER" }, update: { name: "Quản lý Sale" }, create: { code: "SALE_MANAGER", name: "Quản lý Sale" } });
  const saleUser = await prisma.users.upsert({ where: { email: "sale.manager@tvu.edu.vn" }, update: { password_hash: await hash("123456", 10), status: "active", deleted_at: null }, create: { email: "sale.manager@tvu.edu.vn", password_hash: await hash("123456", 10), full_name: "Sale Manager Integration" } });
  await prisma.user_roles.createMany({ data: [{ user_id: saleUser.id, role_id: saleRole.id }], skipDuplicates: true });
  const permissions = await Promise.all(codes.map((code) => prisma.permissions.upsert({ where: { code }, update: {}, create: { code, name: code, module: "custom_field" } })));
  await prisma.role_permissions.createMany({ data: permissions.map((permission) => ({ role_id: role.id, permission_id: permission.id })), skipDuplicates: true });
  await prisma.role_permissions.createMany({ data: permissions.filter((permission) => !["custom_field.view_sensitive", "custom_field.edit_sensitive"].includes(permission.code)).map((permission) => ({ role_id: saleRole.id, permission_id: permission.id })), skipDuplicates: true });
  const program = await prisma.institution_programs.findFirstOrThrow({ select: { id: true } });
  const server = app.listen(0);
  try { await new Promise<void>((resolve) => server.once("listening", resolve)); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`; const token = await login(base); const saleToken = await login(base, "sale.manager@tvu.edu.vn");
  const groups = await request(base, "/custom-fields/groups?entityType=LEAD", { token }); assert.equal(groups.status, 200); const additionalGroupId = groups.payload.find((group: any) => group.groupKey === "additional").id as string;
  const createdGroup = await request(base, "/custom-fields/groups", { token, method: "POST", body: { entityType: "LEAD", groupKey: `test_${run}`, groupLabel: "Nhóm kiểm thử", displayOrder: 999 } }); assert.equal(createdGroup.status, 201); const groupId = createdGroup.payload.id as string;
  assert.equal((await request(base, `/custom-fields/groups/${additionalGroupId}`, { token, method: "PATCH", body: { groupLabel: "Không được đổi" } })).status, 400, "Nhóm hệ thống phải bị khóa.");
  const global = await request(base, "/custom-fields", { token, method: "POST", body: { groupId, fieldKey: `interest_${run}`, fieldLabel: "Mối quan tâm", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "TEXT", isRequired: false, isSearchable: true, isFilterable: true, isSensitive: false, displayOrder: 0 } }); assert.equal(global.status, 201); const id = global.payload.id as string;
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { groupId, fieldKey: `interest_${run}`, fieldLabel: "Trùng", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "TEXT" } })).status, 409);
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { fieldKey: "bad_program", fieldLabel: "Sai", entityType: "LEAD", scopeType: "PROGRAM", fieldType: "TEXT" } })).status, 400);
  const select = await request(base, "/custom-fields", { token, method: "POST", body: { groupId: additionalGroupId, fieldKey: `source_${run}`, fieldLabel: "Nguồn", entityType: "LEAD", scopeType: "PROGRAM", programId: program.id, fieldType: "SELECT", options: [{ code: "ONLINE", label: "Online", isActive: true, displayOrder: 0 }] } }); assert.equal(select.status, 201);
  const saleList = await request(base, "/custom-fields?entityType=LEAD", { token: saleToken }); assert.equal(saleList.status, 200); assert.ok(saleList.payload.some((field: any) => field.id === select.payload.id), "Quản lý Sale phải thấy trường do Giám đốc cấu hình.");
  const saleCreated = await request(base, "/custom-fields", { token: saleToken, method: "POST", body: { groupId: additionalGroupId, fieldKey: `sale_${run}`, fieldLabel: "Trường Sale", entityType: "LEAD", scopeType: "PROGRAM", programId: program.id, fieldType: "TEXT" } }); assert.equal(saleCreated.status, 201, "Quản lý Sale phải tạo được trường theo chương trình đang làm việc.");
  const province = await request(base, "/custom-fields", { token, method: "POST", body: { groupId: additionalGroupId, fieldKey: `province_${run}`, fieldLabel: "Tỉnh thành", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "PROVINCE" } }); assert.equal(province.status, 201);
  const file = await request(base, "/custom-fields", { token, method: "POST", body: { groupId: additionalGroupId, fieldKey: `file_${run}`, fieldLabel: "Tệp đính kèm", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "FILE", validationRules: { maxFiles: 5 } } }); assert.equal(file.status, 201);
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { groupId: additionalGroupId, fieldKey: `bad_file_${run}`, fieldLabel: "File sai", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "FILE", isSearchable: true } })).status, 400);
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { groupId: additionalGroupId, fieldKey: `bad_file_limit_${run}`, fieldLabel: "File sai giới hạn", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "FILE", validationRules: { maxFiles: 2 } } })).status, 400);
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { fieldKey: "bad_select", fieldLabel: "Sai", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "SELECT" } })).status, 400);
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { fieldKey: "bad_sensitive", fieldLabel: "Sai", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "TEXT", isSensitive: true, isSearchable: true } })).status, 400);
  assert.equal((await request(base, `/custom-fields/${id}`, { token, method: "PATCH", body: { fieldKey: "cannot_change" } })).status, 400);
  assert.equal((await request(base, `/custom-fields/${id}`, { token, method: "PATCH", body: { fieldLabel: "Mối quan tâm cập nhật" } })).status, 200);
  await prisma.custom_field_values.create({ data: { custom_field_id: id, entity_type: "LEAD", entity_id: randomUUID(), value: "legacy", value_text: "legacy" } });
  assert.equal((await request(base, `/custom-fields/${id}`, { token, method: "PATCH", body: { fieldType: "NUMBER" } })).status, 400);
  assert.equal((await request(base, `/custom-fields/${id}/status`, { token, method: "PATCH", body: { status: "deactivate" } })).status, 200);
  assert.equal((await request(base, "/custom-fields/reorder", { token, method: "PATCH", body: { fieldIds: [id, select.payload.id] } })).status, 400, "Không được reorder khác scope.");
  assert.equal((await request(base, `/custom-fields/${id}/status`, { token, method: "PATCH", body: { status: "archive" } })).status, 200);
  assert.equal((await request(base, `/custom-fields/${select.payload.id}/status`, { token, method: "PATCH", body: { status: "archive" } })).status, 200);
  assert.equal((await request(base, `/custom-fields/${saleCreated.payload.id}/status`, { token: saleToken, method: "PATCH", body: { status: "archive" } })).status, 200);
  assert.equal((await request(base, `/custom-fields/${province.payload.id}/status`, { token, method: "PATCH", body: { status: "archive" } })).status, 200);
  assert.equal((await request(base, `/custom-fields/${file.payload.id}/status`, { token, method: "PATCH", body: { status: "archive" } })).status, 200);
  assert.equal((await request(base, `/custom-fields/groups/${groupId}/status`, { token, method: "PATCH", body: { status: "archive" } })).status, 200);
  assert.ok(await prisma.audit_logs.count({ where: { entity_type: "custom_field", entity_id: id } }));
  console.log("Custom field definition integration passed.");
 } finally { server.close(); await prisma.$disconnect(); } }
main().catch((error) => { console.error(error); process.exitCode = 1; });
