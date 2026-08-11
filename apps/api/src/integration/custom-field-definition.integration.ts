import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { app } from "../app";
import { prisma } from "../database/prisma";

const run = randomUUID().slice(0, 8);
const codes = ["custom_field.view", "custom_field.create", "custom_field.update", "custom_field.archive", "custom_field.manage_options", "custom_field.view_sensitive", "custom_field.edit_sensitive"];
async function request(base: string, path: string, options: { token?: string; method?: string; body?: unknown; programId?: string } = {}) { const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.programId ? { "x-institution-program-id": options.programId } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) }); return { status: response.status, payload: await response.json().catch(() => ({})) as any }; }
async function login(base: string) { const result = await request(base, "/auth/login", { method: "POST", body: { email: "director@tvu.edu.vn", password: "123456" } }); assert.equal(result.status, 200); return result.payload.accessToken as string; }
async function main() { const role = await prisma.roles.findUniqueOrThrow({ where: { code: "DIRECTOR" } }); const permissions = await Promise.all(codes.map((code) => prisma.permissions.upsert({ where: { code }, update: {}, create: { code, name: code, module: "custom_field" } }))); await prisma.role_permissions.createMany({ data: permissions.map((permission) => ({ role_id: role.id, permission_id: permission.id })), skipDuplicates: true }); const program = await prisma.institution_programs.findFirstOrThrow({ select: { id: true } }); const server = app.listen(0); try { await new Promise<void>((resolve) => server.once("listening", resolve)); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`; const token = await login(base);
  const global = await request(base, "/custom-fields", { token, method: "POST", body: { fieldKey: `interest_${run}`, fieldLabel: "Mối quan tâm", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "TEXT", isRequired: false, isSearchable: true, isFilterable: true, isSensitive: false, displayOrder: 0 } }); assert.equal(global.status, 201); const id = global.payload.id as string;
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { fieldKey: `interest_${run}`, fieldLabel: "Trùng", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "TEXT" } })).status, 409);
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { fieldKey: "bad_program", fieldLabel: "Sai", entityType: "LEAD", scopeType: "PROGRAM", fieldType: "TEXT" } })).status, 400);
  const select = await request(base, "/custom-fields", { token, method: "POST", body: { fieldKey: `source_${run}`, fieldLabel: "Nguồn", entityType: "LEAD", scopeType: "PROGRAM", programId: program.id, fieldType: "SELECT", options: [{ code: "ONLINE", label: "Online", isActive: true, displayOrder: 0 }] } }); assert.equal(select.status, 201);
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { fieldKey: "bad_select", fieldLabel: "Sai", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "SELECT" } })).status, 400);
  assert.equal((await request(base, "/custom-fields", { token, method: "POST", body: { fieldKey: "bad_sensitive", fieldLabel: "Sai", entityType: "LEAD", scopeType: "GLOBAL", fieldType: "TEXT", isSensitive: true, isSearchable: true } })).status, 400);
  assert.equal((await request(base, `/custom-fields/${id}`, { token, method: "PATCH", body: { fieldKey: "cannot_change" } })).status, 400);
  assert.equal((await request(base, `/custom-fields/${id}`, { token, method: "PATCH", body: { fieldLabel: "Mối quan tâm cập nhật" } })).status, 200);
  await prisma.custom_field_values.create({ data: { custom_field_id: id, entity_type: "LEAD", entity_id: randomUUID(), value: "legacy", value_text: "legacy" } });
  assert.equal((await request(base, `/custom-fields/${id}`, { token, method: "PATCH", body: { fieldType: "NUMBER" } })).status, 400);
  assert.equal((await request(base, `/custom-fields/${id}/status`, { token, method: "PATCH", body: { status: "deactivate" } })).status, 200);
  assert.equal((await request(base, "/custom-fields/reorder", { token, method: "PATCH", body: { fieldIds: [id, select.payload.id] } })).status, 400, "Không được reorder khác scope.");
  assert.equal((await request(base, `/custom-fields/${id}/status`, { token, method: "PATCH", body: { status: "archive" } })).status, 200);
  assert.ok(await prisma.audit_logs.count({ where: { entity_type: "custom_field", entity_id: id } }));
  console.log("Custom field definition integration passed.");
 } finally { server.close(); await prisma.$disconnect(); } }
main().catch((error) => { console.error(error); process.exitCode = 1; });
