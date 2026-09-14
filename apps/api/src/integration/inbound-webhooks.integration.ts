import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";
import type { Server } from "node:http";

import { prisma } from "../database/prisma";

type JsonRecord = Record<string, any>;

const runId = randomUUID().slice(0, 8);
const password = `Webhook-${runId}`;
const userIds: string[] = [];
const roleIds: string[] = [];
const programIds: string[] = [];
const sourceIds: string[] = [];
const webhookIds: string[] = [];
let institutionId: string | null = null;
let programTypeId: string | null = null;
let server: Server | null = null;
let assertions = 0;

function equal(actual: unknown, expected: unknown, message: string) {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
}

function check(value: unknown, message: string) {
  assertions += 1;
  assert.ok(value, message);
}

async function api(
  baseUrl: string,
  path: string,
  options: { token?: string; programId?: string; secret?: string; method?: string; body?: unknown } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.programId ? { "X-Institution-Program-Id": options.programId } : {}),
      ...(options.secret ? { "X-Webhook-Secret": options.secret } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, payload: (await response.json().catch(() => ({}))) as JsonRecord };
}

async function ensurePermission(code: string) {
  return prisma.permissions.upsert({
    where: { code },
    update: { is_active: true },
    create: { code, name: code, module: "system", is_active: true },
    select: { id: true },
  });
}

async function createActor(label: string, permissions: string[], programId: string) {
  const role = await prisma.roles.create({
    data: { code: `WH_${label}_${runId}`.toUpperCase(), name: `Webhook ${label}` },
    select: { id: true },
  });
  roleIds.push(role.id);
  const grants = await Promise.all(permissions.map(ensurePermission));
  await prisma.role_permissions.createMany({
    data: grants.map((permission) => ({ role_id: role.id, permission_id: permission.id })),
  });
  await prisma.role_institution_programs.create({
    data: { role_id: role.id, institution_program_id: programId },
  });
  const email = `webhook.${label}.${runId}@example.test`;
  const user = await prisma.users.create({
    data: { email, password_hash: await hash(password, 10), full_name: `Webhook ${label}`, status: "active" },
    select: { id: true },
  });
  userIds.push(user.id);
  await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
  return { id: user.id, email };
}

async function login(baseUrl: string, email: string) {
  const result = await api(baseUrl, "/auth/login", { method: "POST", body: { email, password } });
  equal(result.status, 200, "Đăng nhập actor phải thành công.");
  check(typeof result.payload.accessToken === "string", "Login phải trả access token.");
  return result.payload.accessToken as string;
}

async function cleanup() {
  const leads = await prisma.leads.findMany({ where: { owner_id: { in: userIds } }, select: { id: true } });
  const leadIds = leads.map((lead) => lead.id);
  await prisma.audit_logs.deleteMany({
    where: { OR: [{ user_id: { in: userIds } }, { entity_id: { in: [...leadIds, ...webhookIds] } }] },
  });
  await prisma.automation_execution_logs.deleteMany({ where: { requested_by: { in: userIds } } });
  await prisma.webhooks.deleteMany({ where: { id: { in: webhookIds } } });
  await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.lead_sources.deleteMany({ where: { id: { in: sourceIds } } });
  await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  await prisma.role_permissions.deleteMany({ where: { role_id: { in: roleIds } } });
  await prisma.role_institution_programs.deleteMany({ where: { role_id: { in: roleIds } } });
  await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
  await prisma.institution_programs.deleteMany({ where: { id: { in: programIds } } });
  if (institutionId) await prisma.institutions.deleteMany({ where: { id: institutionId } });
  if (programTypeId) await prisma.program_types.deleteMany({ where: { id: programTypeId } });
}

const webhookInput = {
  name: "Website Lead",
  targetModule: "LEAD",
  status: "ACTIVE",
  mappings: [
    { incomingKey: "name", crmField: "fullName", isRequired: true, defaultValue: null },
    { incomingKey: "phone", crmField: "phone", isRequired: true, defaultValue: null },
    { incomingKey: "email", crmField: "email", isRequired: false, defaultValue: null },
    { incomingKey: "utm_source", crmField: "source", isRequired: false, defaultValue: "Website" },
    { incomingKey: "graduation_year", crmField: "graduationYear", isRequired: false, defaultValue: null },
  ],
};

async function main() {
  process.env.NODE_ENV = "test";
  const { app } = await import("../app.js");
  const institution = await prisma.institutions.create({
    data: { code: `WH_INST_${runId}`, name: "Webhook Institution" }, select: { id: true },
  });
  institutionId = institution.id;
  const programType = await prisma.program_types.create({
    data: { code: `WH_TYPE_${runId}`, name: "Webhook Type" }, select: { id: true },
  });
  programTypeId = programType.id;
  for (const suffix of ["A", "B"]) {
    const program = await prisma.institution_programs.create({
      data: { institution_id: institution.id, program_type_id: programType.id, code: `WH_PROGRAM_${suffix}_${runId}`, name: `Webhook Program ${suffix}` },
      select: { id: true },
    });
    programIds.push(program.id);
    const source = await prisma.lead_sources.create({
      data: { institution_program_id: program.id, name: "Website đăng ký", type: "webhook" }, select: { id: true },
    });
    sourceIds.push(source.id);
  }
  const facebookSource = await prisma.lead_sources.create({
    data: { institution_program_id: programIds[0], name: "Facebook Ads", type: "paid_social" },
    select: { id: true },
  });
  sourceIds.push(facebookSource.id);
  const manager = await createActor("manager", ["webhook.view", "webhook.manage"], programIds[0]);
  const viewer = await createActor("viewer", ["webhook.view"], programIds[0]);
  const outsider = await createActor("outsider", ["webhook.view", "webhook.manage"], programIds[1]);
  const noAccess = await createActor("none", [], programIds[0]);

  const listeningServer = app.listen(0);
  server = listeningServer;
  await new Promise<void>((resolve, reject) => {
    listeningServer.once("listening", resolve);
    listeningServer.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${(listeningServer.address() as AddressInfo).port}/api`;
  const [managerToken, viewerToken, outsiderToken, noAccessToken] = await Promise.all([
    login(baseUrl, manager.email), login(baseUrl, viewer.email), login(baseUrl, outsider.email), login(baseUrl, noAccess.email),
  ]);

  equal((await api(baseUrl, "/settings/webhooks", { token: noAccessToken, programId: programIds[0] })).status, 403, "List phải kiểm tra permission.");
  equal((await api(baseUrl, "/settings/webhooks", { token: viewerToken, programId: programIds[0], method: "POST", body: webhookInput })).status, 403, "View không được tạo webhook.");

  const created = await api(baseUrl, "/settings/webhooks", { token: managerToken, programId: programIds[0], method: "POST", body: webhookInput });
  equal(created.status, 201, "Tạo webhook phải thành công.");
  check(typeof created.payload.secret === "string" && created.payload.secret.length >= 32, "Secret phải đủ mạnh.");
  check(typeof created.payload.webhookKey === "string" && created.payload.webhookKey.length >= 20, "Webhook key phải khó đoán.");
  webhookIds.push(created.payload.id);
  const webhookId = created.payload.id as string;
  const key = created.payload.webhookKey as string;
  const secret = created.payload.secret as string;

  const second = await api(baseUrl, "/settings/webhooks", { token: managerToken, programId: programIds[0], method: "POST", body: { ...webhookInput, name: "Website Lead 2" } });
  equal(second.status, 201, "Tạo webhook thứ hai phải thành công.");
  webhookIds.push(second.payload.id);
  check(second.payload.webhookKey !== key, "Webhook key phải duy nhất.");

  equal((await api(baseUrl, `/settings/webhooks/${webhookId}`, { token: outsiderToken, programId: programIds[1] })).status, 404, "Tenant khác không được xem webhook.");
  equal((await api(baseUrl, "/settings/webhooks", { token: outsiderToken, programId: programIds[1] })).payload.data.length, 0, "Tenant khác không được list webhook.");

  const wrongSecret = await api(baseUrl, `/webhooks/${key}`, { secret: "wrong-secret", method: "POST", body: { name: "Wrong", phone: "0901000001" } });
  equal(wrongSecret.status, 401, "Secret sai phải bị từ chối.");
  equal(wrongSecret.payload.error.code, "INVALID_SECRET", "Secret sai phải có error code ổn định.");

  const phone1 = `091${Date.now().toString().slice(-7)}`;
  await prisma.leads.create({
    data: { full_name: "Same phone other tenant", phone: phone1, institution_program_id: programIds[1], source_id: sourceIds[1], owner_id: outsider.id },
  });
  const accepted = await api(baseUrl, `/webhooks/${key}`, {
    secret, method: "POST", body: { name: "Webhook Lead", phone: phone1, email: "webhook@example.test", utm_source: "facebook", graduation_year: "2024", workspace_id: programIds[1] },
  });
  equal(accepted.status, 200, "Public endpoint không cần user session khi secret đúng.");
  check(typeof accepted.payload.data.record_id === "string", "Webhook phải trả record_id.");
  const lead = await prisma.leads.findUniqueOrThrow({ where: { id: accepted.payload.data.record_id }, select: { institution_program_id: true, source_id: true, full_name: true } });
  equal(lead.institution_program_id, programIds[0], "Payload không được spoof tenant.");
  equal(lead.source_id, facebookSource.id, "Giá trị facebook phải resolve thành Facebook Ads trong tenant webhook.");
  equal(lead.full_name, "Webhook Lead", "Mapping incoming key phải hoạt động.");

  const beforeMissing = await prisma.leads.count({ where: { owner_id: manager.id } });
  const missing = await api(baseUrl, `/webhooks/${key}`, { secret, method: "POST", body: { name: "Missing phone" } });
  equal(missing.status, 400, "Thiếu required field phải trả 400.");
  equal(missing.payload.error.code, "MISSING_REQUIRED_FIELD", "Thiếu field phải có error code đúng.");
  equal(await prisma.leads.count({ where: { owner_id: manager.id } }), beforeMissing, "Validation fail không được tạo Lead.");

  const invalid = await api(baseUrl, `/webhooks/${key}`, { secret, method: "POST", body: { name: "Invalid phone", phone: "abc" } });
  equal(invalid.payload.error.code, "INVALID_FIELD_VALUE", "Sai type phải bị từ chối.");

  equal((await api(baseUrl, `/settings/webhooks/${webhookId}/status`, { token: managerToken, programId: programIds[0], method: "PATCH", body: { status: "DISABLED" } })).status, 200, "Disable webhook phải thành công.");
  equal((await api(baseUrl, `/webhooks/${key}`, { secret, method: "POST", body: { name: "Disabled", phone: "0901000002" } })).status, 403, "Webhook disabled phải bị từ chối.");
  await api(baseUrl, `/settings/webhooks/${webhookId}/status`, { token: managerToken, programId: programIds[0], method: "PATCH", body: { status: "ACTIVE" } });
  equal((await api(baseUrl, `/settings/webhooks/${webhookId}/status`, { token: viewerToken, programId: programIds[0], method: "PATCH", body: { status: "DISABLED" } })).status, 403, "Quyền view không được đổi trạng thái.");

  const regenerated = await api(baseUrl, `/settings/webhooks/${webhookId}/regenerate-secret`, { token: managerToken, programId: programIds[0], method: "POST" });
  equal(regenerated.status, 200, "Regenerate secret phải thành công.");
  equal((await api(baseUrl, `/webhooks/${key}`, { secret, method: "POST", body: { name: "Old secret", phone: "0901000003" } })).status, 401, "Secret cũ phải mất hiệu lực.");

  const phone2 = `092${Date.now().toString().slice(-7)}`;
  equal((await api(baseUrl, `/webhooks/${key}`, { secret: regenerated.payload.secret, method: "POST", body: { name: "New secret", phone: phone2, utm_source: "Website" } })).status, 200, "Secret mới phải hoạt động.");
  const testPhone = `093${Date.now().toString().slice(-7)}`;
  const tested = await api(baseUrl, `/settings/webhooks/${webhookId}/test`, { token: managerToken, programId: programIds[0], method: "POST", body: { payload: { name: "Test endpoint", phone: testPhone } } });
  equal(tested.status, 200, "Test endpoint phải dùng cùng pipeline.");
  const testedLead = await prisma.leads.findUniqueOrThrow({ where: { id: tested.payload.data.record_id }, select: { source_id: true } });
  equal(testedLead.source_id, sourceIds[0], "Default Website phải resolve thành Website đăng ký.");

  const invalidJsonResponse = await fetch(`${baseUrl}/webhooks/${key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": regenerated.payload.secret }, body: "{" });
  equal(invalidJsonResponse.status, 400, "JSON lỗi cú pháp phải trả 400.");
  const wrongTypeResponse = await fetch(`${baseUrl}/webhooks/${key}`, { method: "POST", headers: { "Content-Type": "text/plain", "X-Webhook-Secret": regenerated.payload.secret }, body: "plain" });
  equal(wrongTypeResponse.status, 415, "Content-Type khác JSON phải bị từ chối.");
  const oversizedResponse = await fetch(`${baseUrl}/webhooks/${key}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": regenerated.payload.secret }, body: JSON.stringify({ value: "x".repeat(300 * 1024) }) });
  equal(oversizedResponse.status, 413, "Payload vượt 256 KB phải bị từ chối.");

  const logs = await api(baseUrl, `/settings/webhooks/${webhookId}/logs`, { token: viewerToken, programId: programIds[0] });
  equal(logs.status, 200, "Quyền view phải xem được logs.");
  check(logs.payload.data.some((item: JsonRecord) => item.status === "SUCCESS"), "Phải ghi log success.");
  check(logs.payload.data.some((item: JsonRecord) => item.status === "FAILED"), "Phải ghi log failure.");
  check(logs.payload.data.some((item: JsonRecord) => item.errorCode === "PAYLOAD_TOO_LARGE"), "Payload quá lớn phải được ghi log.");
  const acceptedLog = logs.payload.data.find((item: JsonRecord) => item.requestId === accepted.payload.data.request_id);
  const acceptedLogDetail = await api(baseUrl, `/settings/webhooks/${webhookId}/logs/${acceptedLog.id}`, { token: viewerToken, programId: programIds[0] });
  equal(typeof acceptedLogDetail.payload.mappedPayload.graduationYear, "number", "Mapped payload phải lưu number sau type conversion.");
  equal((await api(baseUrl, `/settings/webhooks/${webhookId}/logs/${logs.payload.data[0].id}`, { token: outsiderToken, programId: programIds[1] })).status, 404, "Tenant khác không được xem log detail.");

  equal((await api(baseUrl, `/settings/webhooks/${webhookId}`, { token: managerToken, programId: programIds[0], method: "DELETE" })).status, 200, "Delete webhook phải thành công.");
  equal((await api(baseUrl, `/webhooks/${key}`, { secret: regenerated.payload.secret, method: "POST", body: { name: "Deleted", phone: "0901000004" } })).status, 404, "Webhook đã xóa phải trả 404.");
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await cleanup();
    await prisma.$disconnect();
    if (!process.exitCode) console.log(`Inbound webhook integration verified with ${assertions} assertions.`);
  });
