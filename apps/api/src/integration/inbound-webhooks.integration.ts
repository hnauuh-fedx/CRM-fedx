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
const customFieldIds: string[] = [];
let customFieldGroupId: string | null = null;
let institutionId: string | null = null;
let programTypeId: string | null = null;
let server: Server | null = null;
let assertions = 0;
let processQueuedWebhook: ((requestId: string) => Promise<unknown>) | null = null;

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
  options: {
    token?: string;
    programId?: string;
    secret?: string;
    method?: string;
    body?: unknown;
  } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.programId
        ? { "X-Institution-Program-Id": options.programId }
        : {}),
      ...(options.secret ? { "X-Webhook-Secret": options.secret } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (
    processQueuedWebhook &&
    path.startsWith("/webhooks/") &&
    response.status === 202 &&
    typeof payload.data?.request_id === "string"
  ) {
    await processQueuedWebhook(payload.data.request_id);
    const persisted = await prisma.webhook_requests.findUniqueOrThrow({
      where: { request_id: payload.data.request_id },
    });
    return persisted.status === "SUCCEEDED"
      ? {
          status: 200,
          payload: {
            success: true,
            data: {
              request_id: persisted.request_id,
              record_id: persisted.record_id,
              action: persisted.action === "UPDATED" ? "updated" : "created",
            },
          },
        }
      : {
          status: persisted.response_code ?? 422,
          payload: {
            success: false,
            error: {
              code: persisted.error_code,
              message: persisted.error_message,
            },
          },
        };
  }
  return {
    status: response.status,
    payload,
  };
}

async function ensurePermission(code: string) {
  return prisma.permissions.upsert({
    where: { code },
    update: { is_active: true },
    create: { code, name: code, module: "system", is_active: true },
    select: { id: true },
  });
}

async function createActor(
  label: string,
  permissions: string[],
  programId: string,
  accessScope?: "ALL" | "DEPARTMENT",
) {
  const role = await prisma.roles.create({
    data: {
      code: `WH_${label}_${runId}`.toUpperCase(),
      name: `Webhook ${label}`,
    },
    select: { id: true },
  });
  roleIds.push(role.id);
  const grants = await Promise.all(permissions.map(ensurePermission));
  await prisma.role_permissions.createMany({
    data: grants.map((permission) => ({
      role_id: role.id,
      permission_id: permission.id,
    })),
  });
  await prisma.role_institution_programs.create({
    data: { role_id: role.id, institution_program_id: programId },
  });
  const email = `webhook.${label}.${runId}@example.test`;
  const user = await prisma.users.create({
    data: {
      email,
      password_hash: await hash(password, 10),
      full_name: `Webhook ${label}`,
      status: "active",
    },
    select: { id: true },
  });
  userIds.push(user.id);
  await prisma.user_roles.create({
    data: { user_id: user.id, role_id: role.id },
  });
  if (accessScope) {
    await prisma.user_access_scopes.create({
      data: { user_id: user.id, scope: accessScope },
    });
  }
  return { id: user.id, email };
}

async function login(baseUrl: string, email: string) {
  const result = await api(baseUrl, "/auth/login", {
    method: "POST",
    body: { email, password },
  });
  equal(result.status, 200, "Đăng nhập actor phải thành công.");
  check(
    typeof result.payload.accessToken === "string",
    "Login phải trả access token.",
  );
  return result.payload.accessToken as string;
}

async function cleanup() {
  const leads = await prisma.leads.findMany({
    where: { owner_id: { in: userIds } },
    select: { id: true },
  });
  const leadIds = leads.map((lead) => lead.id);
  await prisma.audit_logs.deleteMany({
    where: {
      OR: [
        { user_id: { in: userIds } },
        { entity_id: { in: [...leadIds, ...webhookIds] } },
      ],
    },
  });
  await prisma.automation_execution_logs.deleteMany({
    where: { requested_by: { in: userIds } },
  });
  await prisma.webhooks.deleteMany({ where: { id: { in: webhookIds } } });
  await prisma.custom_field_values.deleteMany({
    where: { custom_field_id: { in: customFieldIds } },
  });
  await prisma.custom_fields.deleteMany({
    where: { id: { in: customFieldIds } },
  });
  if (customFieldGroupId)
    await prisma.custom_field_groups.deleteMany({
      where: { id: customFieldGroupId },
    });
  await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.lead_sources.deleteMany({ where: { id: { in: sourceIds } } });
  await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  await prisma.role_permissions.deleteMany({
    where: { role_id: { in: roleIds } },
  });
  await prisma.role_institution_programs.deleteMany({
    where: { role_id: { in: roleIds } },
  });
  await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
  await prisma.institution_programs.deleteMany({
    where: { id: { in: programIds } },
  });
  if (institutionId)
    await prisma.institutions.deleteMany({ where: { id: institutionId } });
  if (programTypeId)
    await prisma.program_types.deleteMany({ where: { id: programTypeId } });
}

const webhookInput = {
  name: "Website Lead",
  targetModule: "LEAD",
  status: "ACTIVE",
  duplicatePolicy: "CREATE_NEW",
  mappings: [
    {
      incomingKey: "name",
      crmField: "fullName",
      isRequired: true,
      defaultValue: null,
    },
    {
      incomingKey: "phone",
      crmField: "phone",
      isRequired: true,
      defaultValue: null,
    },
    {
      incomingKey: "email",
      crmField: "email",
      isRequired: false,
      defaultValue: null,
    },
    {
      incomingKey: "utm_source",
      crmField: "source",
      isRequired: false,
      defaultValue: "Website",
    },
    {
      incomingKey: "graduation_year",
      crmField: "graduationYear",
      isRequired: false,
      defaultValue: null,
    },
  ],
};

async function main() {
  process.env.NODE_ENV = "test";
  const { app } = await import("../app.js");
  const { processInboundWebhook } = await import(
    "../modules/webhooks/webhook.service.js"
  );
  const { cleanupExpiredWebhookLogs } = await import(
    "../modules/webhooks/webhook-retention.service.js"
  );
  const { createWebhookRateLimiter } = await import(
    "../modules/webhooks/webhooks.router.js"
  );
  const { setPublicWebhookRateLimiterForTests } = await import(
    "../modules/webhooks/webhooks.router.js"
  );
  const { createMemoryWebhookRateLimiter } = await import(
    "../modules/webhooks/webhook-rate-limit.service.js"
  );
  const { setWebhookQueueAdapterForTests } = await import(
    "../modules/webhooks/webhook-queue.service.js"
  );
  const { processInboundWebhookRequest } = await import(
    "../modules/webhooks/webhook-v2.service.js"
  );
  setPublicWebhookRateLimiterForTests(createMemoryWebhookRateLimiter(10_000));
  setWebhookQueueAdapterForTests({
    async add(requestId: string) { return { id: `test-${requestId}` }; },
    async has() { return false; },
    async counts() { return {}; },
  });
  processQueuedWebhook = processInboundWebhookRequest;
  const institution = await prisma.institutions.create({
    data: { code: `WH_INST_${runId}`, name: "Webhook Institution" },
    select: { id: true },
  });
  institutionId = institution.id;
  const programType = await prisma.program_types.create({
    data: { code: `WH_TYPE_${runId}`, name: "Webhook Type" },
    select: { id: true },
  });
  programTypeId = programType.id;
  for (const suffix of ["A", "B"]) {
    const program = await prisma.institution_programs.create({
      data: {
        institution_id: institution.id,
        program_type_id: programType.id,
        code: `WH_PROGRAM_${suffix}_${runId}`,
        name: `Webhook Program ${suffix}`,
      },
      select: { id: true },
    });
    programIds.push(program.id);
    const source = await prisma.lead_sources.create({
      data: {
        institution_program_id: program.id,
        name: "Website đăng ký",
        type: "webhook",
      },
      select: { id: true },
    });
    sourceIds.push(source.id);
  }
  const facebookSource = await prisma.lead_sources.create({
    data: {
      institution_program_id: programIds[0],
      name: "Facebook Ads",
      type: "paid_social",
    },
    select: { id: true },
  });
  sourceIds.push(facebookSource.id);
  const customGroup = await prisma.custom_field_groups.create({
    data: {
      entity_type: "LEAD",
      group_key: `webhook_${runId}`,
      group_label: "Webhook custom",
      is_active: true,
    },
    select: { id: true },
  });
  customFieldGroupId = customGroup.id;
  const customFields = await Promise.all([
    prisma.custom_fields.create({
      data: {
        module: "lead",
        entity_type: "LEAD",
        scope_type: "PROGRAM",
        program_id: programIds[0],
        group_id: customGroup.id,
        field_key: `webhook_text_${runId}`,
        field_label: "Nhu cầu",
        field_type: "TEXT",
        is_active: true,
      },
    }),
    prisma.custom_fields.create({
      data: {
        module: "lead",
        entity_type: "LEAD",
        scope_type: "PROGRAM",
        program_id: programIds[0],
        group_id: customGroup.id,
        field_key: `webhook_number_${runId}`,
        field_label: "Ngân sách",
        field_type: "NUMBER",
        is_active: true,
      },
    }),
    prisma.custom_fields.create({
      data: {
        module: "lead",
        entity_type: "LEAD",
        scope_type: "PROGRAM",
        program_id: programIds[0],
        group_id: customGroup.id,
        field_key: `webhook_select_${runId}`,
        field_label: "Kênh ưu tiên",
        field_type: "SELECT",
        options: [{ code: "ONLINE", label: "Online", isActive: true }],
        is_active: true,
      },
    }),
    prisma.custom_fields.create({
      data: {
        module: "lead",
        entity_type: "LEAD",
        scope_type: "PROGRAM",
        program_id: programIds[1],
        group_id: customGroup.id,
        field_key: `webhook_other_${runId}`,
        field_label: "Tenant B only",
        field_type: "TEXT",
        is_active: true,
      },
    }),
    prisma.custom_fields.create({
      data: {
        module: "lead",
        entity_type: "LEAD",
        scope_type: "PROGRAM",
        program_id: programIds[0],
        group_id: customGroup.id,
        field_key: `webhook_date_${runId}`,
        field_label: "Ngày hẹn",
        field_type: "DATE",
        is_active: true,
      },
    }),
  ]);
  customFieldIds.push(...customFields.map((field) => field.id));
  const manager = await createActor(
    "manager",
    ["webhook.view", "webhook.manage", "lead.view_all"],
    programIds[0],
    "ALL",
  );
  const viewer = await createActor("viewer", ["webhook.view"], programIds[0]);
  const outsider = await createActor(
    "outsider",
    ["webhook.view", "webhook.manage"],
    programIds[1],
  );
  const noAccess = await createActor("none", [], programIds[0]);

  const listeningServer = app.listen(0);
  server = listeningServer;
  await new Promise<void>((resolve, reject) => {
    listeningServer.once("listening", resolve);
    listeningServer.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${(listeningServer.address() as AddressInfo).port}/api`;
  const [managerToken, viewerToken, outsiderToken, noAccessToken] =
    await Promise.all([
      login(baseUrl, manager.email),
      login(baseUrl, viewer.email),
      login(baseUrl, outsider.email),
      login(baseUrl, noAccess.email),
    ]);

  const metadata = await api(baseUrl, "/settings/webhooks/metadata", {
    token: managerToken,
    programId: programIds[0],
  });
  equal(metadata.status, 200, "Metadata webhook phải tải được.");
  check(
    metadata.payload.fields.some(
      (field: JsonRecord) => field.key === `custom:${customFields[0].id}`,
    ),
    "Metadata phải có custom field cùng tenant.",
  );
  check(
    !metadata.payload.fields.some(
      (field: JsonRecord) => field.key === `custom:${customFields[3].id}`,
    ),
    "Metadata không được lộ custom field tenant khác.",
  );
  check(
    !metadata.payload.fields.some(
      (field: JsonRecord) => field.key === "institution_program_id",
    ),
    "Metadata không được expose system field.",
  );

  equal(
    (
      await api(baseUrl, "/settings/webhooks", {
        token: noAccessToken,
        programId: programIds[0],
      })
    ).status,
    403,
    "List phải kiểm tra permission.",
  );
  equal(
    (
      await api(baseUrl, "/settings/webhooks", {
        token: viewerToken,
        programId: programIds[0],
        method: "POST",
        body: webhookInput,
      })
    ).status,
    403,
    "View không được tạo webhook.",
  );

  const created = await api(baseUrl, "/settings/webhooks", {
    token: managerToken,
    programId: programIds[0],
    method: "POST",
    body: webhookInput,
  });
  equal(created.status, 201, "Tạo webhook phải thành công.");
  check(
    typeof created.payload.secret === "string" &&
      created.payload.secret.length >= 32,
    "Secret phải đủ mạnh.",
  );
  check(
    created.payload.secretHash === undefined &&
      created.payload.secret_hash === undefined,
    "API không được expose secret hash.",
  );
  check(
    typeof created.payload.webhookKey === "string" &&
      created.payload.webhookKey.length >= 20,
    "Webhook key phải khó đoán.",
  );
  webhookIds.push(created.payload.id);
  const webhookId = created.payload.id as string;
  const key = created.payload.webhookKey as string;
  const secret = created.payload.secret as string;

  const forgedMapping = await api(baseUrl, "/settings/webhooks", {
    token: managerToken,
    programId: programIds[0],
    method: "POST",
    body: {
      ...webhookInput,
      name: "Forged",
      mappings: [
        {
          incomingKey: "tenant",
          crmField: "institution_program_id",
          isRequired: false,
          defaultValue: null,
        },
      ],
    },
  });
  equal(
    forgedMapping.status,
    400,
    "Backend phải từ chối mapping system field giả mạo.",
  );
  const crossTenantMapping = await api(baseUrl, "/settings/webhooks", {
    token: managerToken,
    programId: programIds[0],
    method: "POST",
    body: {
      ...webhookInput,
      name: "Cross tenant custom",
      mappings: [
        ...webhookInput.mappings,
        {
          incomingKey: "other",
          crmField: `custom:${customFields[3].id}`,
          isRequired: false,
          defaultValue: null,
        },
      ],
    },
  });
  equal(
    crossTenantMapping.status,
    400,
    "Backend phải từ chối custom field tenant khác.",
  );

  const second = await api(baseUrl, "/settings/webhooks", {
    token: managerToken,
    programId: programIds[0],
    method: "POST",
    body: { ...webhookInput, name: "Website Lead 2" },
  });
  equal(second.status, 201, "Tạo webhook thứ hai phải thành công.");
  webhookIds.push(second.payload.id);
  check(second.payload.webhookKey !== key, "Webhook key phải duy nhất.");

  equal(
    (
      await api(baseUrl, `/settings/webhooks/${webhookId}`, {
        token: outsiderToken,
        programId: programIds[1],
      })
    ).status,
    404,
    "Tenant khác không được xem webhook.",
  );
  equal(
    (
      await api(baseUrl, "/settings/webhooks", {
        token: outsiderToken,
        programId: programIds[1],
      })
    ).payload.data.length,
    0,
    "Tenant khác không được list webhook.",
  );

  const wrongSecret = await api(baseUrl, `/webhooks/${key}`, {
    secret: "wrong-secret",
    method: "POST",
    body: { name: "Wrong", phone: "0901000001" },
  });
  equal(wrongSecret.status, 401, "Secret sai phải bị từ chối.");
  equal(
    wrongSecret.payload.error.code,
    "INVALID_SECRET",
    "Secret sai phải có error code ổn định.",
  );
  const rateLimitedBeforeSecretCheck = await processInboundWebhook(
    key,
    "wrong-secret",
    {},
    () => true,
  );
  equal(
    rateLimitedBeforeSecretCheck.status,
    429,
    "Rate limit phải chạy trước bước kiểm tra secret tốn CPU.",
  );
  equal(
    rateLimitedBeforeSecretCheck.ok,
    false,
    "Request bị rate limit không được đi tiếp vào pipeline.",
  );

  const phone1 = `091${Date.now().toString().slice(-7)}`;
  await prisma.leads.create({
    data: {
      full_name: "Same phone other tenant",
      phone: phone1,
      institution_program_id: programIds[1],
      source_id: sourceIds[1],
      owner_id: outsider.id,
    },
  });
  const accepted = await api(baseUrl, `/webhooks/${key}`, {
    secret,
    method: "POST",
    body: {
      name: "Webhook Lead",
      phone: phone1,
      email: "webhook@example.test",
      utm_source: "facebook",
      graduation_year: "2024",
      workspace_id: programIds[1],
    },
  });
  equal(
    accepted.status,
    200,
    "Public endpoint không cần user session khi secret đúng.",
  );
  check(
    typeof accepted.payload.data.record_id === "string",
    "Webhook phải trả record_id.",
  );
  const lead = await prisma.leads.findUniqueOrThrow({
    where: { id: accepted.payload.data.record_id },
    select: { institution_program_id: true, source_id: true, full_name: true },
  });
  equal(
    lead.institution_program_id,
    programIds[0],
    "Payload không được spoof tenant.",
  );
  equal(
    lead.source_id,
    facebookSource.id,
    "Giá trị facebook phải resolve thành Facebook Ads trong tenant webhook.",
  );
  equal(lead.full_name, "Webhook Lead", "Mapping incoming key phải hoạt động.");

  const createNewAgain = await api(baseUrl, `/webhooks/${key}`, {
    secret,
    method: "POST",
    body: {
      name: "Webhook Lead duplicate",
      phone: phone1,
      email: "duplicate@example.test",
      utm_source: "Website",
    },
  });
  equal(
    createNewAgain.status,
    200,
    "CREATE_NEW phải cho phép tạo Lead cùng phone.",
  );
  equal(
    createNewAgain.payload.data.action,
    "created",
    "CREATE_NEW phải trả action created.",
  );
  equal(
    await prisma.leads.count({
      where: {
        institution_program_id: programIds[0],
        phone: phone1,
        deleted_at: null,
      },
    }),
    2,
    "CREATE_NEW phải tạo hai Lead trong cùng tenant.",
  );

  const updateInput = { ...webhookInput, duplicatePolicy: "UPDATE_EXISTING" };
  equal(
    (
      await api(baseUrl, `/settings/webhooks/${webhookId}`, {
        token: managerToken,
        programId: programIds[0],
        method: "PATCH",
        body: updateInput,
      })
    ).status,
    200,
    "Phải cập nhật được policy UPDATE_EXISTING.",
  );
  const crossTenantPhone = `098${Date.now().toString().slice(-7)}`;
  const tenantBLead = await prisma.leads.create({
    data: {
      full_name: "Tenant B untouched",
      phone: crossTenantPhone,
      email: "tenant-b@example.test",
      institution_program_id: programIds[1],
      source_id: sourceIds[1],
      owner_id: outsider.id,
    },
    select: { id: true },
  });
  const crossTenantResult = await api(baseUrl, `/webhooks/${key}`, {
    secret,
    method: "POST",
    body: {
      name: "Tenant A new",
      phone: crossTenantPhone,
      email: "tenant-a@example.test",
    },
  });
  equal(
    crossTenantResult.payload.data.action,
    "created",
    "Lead cùng phone ở tenant khác không được coi là duplicate.",
  );
  equal(
    (
      await prisma.leads.findUniqueOrThrow({
        where: { id: tenantBLead.id },
        select: { email: true },
      })
    ).email,
    "tenant-b@example.test",
    "UPDATE_EXISTING không được tác động Lead tenant khác.",
  );
  const updatePhone = `094${Date.now().toString().slice(-7)}`;
  const updateCreated = await api(baseUrl, `/webhooks/${key}`, {
    secret,
    method: "POST",
    body: {
      name: "Tên giữ nguyên",
      phone: updatePhone,
      email: "old@example.test",
    },
  });
  equal(
    updateCreated.payload.data.action,
    "created",
    "UPDATE_EXISTING phải tạo khi chưa có duplicate.",
  );
  const updateResult = await api(baseUrl, `/webhooks/${key}`, {
    secret,
    method: "POST",
    body: { phone: updatePhone, email: "new@example.test" },
  });
  equal(
    updateResult.status,
    200,
    "UPDATE_EXISTING phải xử lý duplicate thành công.",
  );
  equal(
    updateResult.payload.data.action,
    "updated",
    "UPDATE_EXISTING phải trả action updated.",
  );
  equal(
    updateResult.payload.data.record_id,
    updateCreated.payload.data.record_id,
    "UPDATE_EXISTING không được tạo record mới.",
  );
  const updatedLead = await prisma.leads.findUniqueOrThrow({
    where: { id: updateResult.payload.data.record_id },
    select: { full_name: true, email: true },
  });
  equal(
    updatedLead.full_name,
    "Tên giữ nguyên",
    "Field thiếu trong payload không được bị xóa.",
  );
  equal(
    updatedLead.email,
    "new@example.test",
    "Field có trong payload phải được cập nhật.",
  );

  const concurrentPhone = `095${Date.now().toString().slice(-7)}`;
  const concurrentResults = await Promise.all([
    api(baseUrl, `/webhooks/${key}`, {
      secret,
      method: "POST",
      body: { name: "Concurrent A", phone: concurrentPhone },
    }),
    api(baseUrl, `/webhooks/${key}`, {
      secret,
      method: "POST",
      body: { name: "Concurrent B", phone: concurrentPhone },
    }),
  ]);
  check(
    concurrentResults.every((result) => result.status === 200),
    "Hai request song song phải xử lý thành công.",
  );
  equal(
    await prisma.leads.count({
      where: {
        institution_program_id: programIds[0],
        phone: concurrentPhone,
        deleted_at: null,
      },
    }),
    1,
    "Advisory lock phải ngăn duplicate ngoài ý muốn.",
  );

  const tenantBWebhook = await api(baseUrl, "/settings/webhooks", {
    token: outsiderToken,
    programId: programIds[1],
    method: "POST",
    body: { ...webhookInput, name: "Tenant B concurrent", duplicatePolicy: "UPDATE_EXISTING" },
  });
  equal(tenantBWebhook.status, 201, "Tenant B phải tạo được webhook riêng cho kiểm thử concurrency.");
  webhookIds.push(tenantBWebhook.payload.id);
  const crossTenantConcurrentPhone = `089${Date.now().toString().slice(-7)}`;
  const crossTenantConcurrentResults = await Promise.all([
    api(baseUrl, `/webhooks/${key}`, {
      secret,
      method: "POST",
      body: { name: "Tenant A concurrent", phone: crossTenantConcurrentPhone },
    }),
    api(baseUrl, `/webhooks/${tenantBWebhook.payload.webhookKey}`, {
      secret: tenantBWebhook.payload.secret,
      method: "POST",
      body: { name: "Tenant B concurrent", phone: crossTenantConcurrentPhone },
    }),
  ]);
  check(crossTenantConcurrentResults.every((result) => result.status === 200), "Hai tenant phải xử lý song song độc lập.");
  equal(await prisma.leads.count({ where: { institution_program_id: programIds[0], phone: crossTenantConcurrentPhone, deleted_at: null } }), 1, "Tenant A phải có đúng một Lead sau cross-tenant concurrency.");
  equal(await prisma.leads.count({ where: { institution_program_id: programIds[1], phone: crossTenantConcurrentPhone, deleted_at: null } }), 1, "Tenant B phải có đúng một Lead sau cross-tenant concurrency.");
  const outOfScopeTest = await api(baseUrl, `/settings/webhooks/${tenantBWebhook.payload.id}/test`, {
    token: outsiderToken,
    programId: programIds[1],
    method: "POST",
    body: { payload: { name: "Out of scope update", phone: crossTenantConcurrentPhone } },
  });
  equal(outOfScopeTest.status, 403, "Admin test không được cập nhật Lead nằm ngoài scope của người dùng.");
  equal(await prisma.leads.count({ where: { institution_program_id: programIds[1], phone: crossTenantConcurrentPhone, deleted_at: null } }), 1, "Admin test ngoài scope không được tạo hoặc cập nhật Lead.");
  const hiddenRecordTestPhone = `086${Date.now().toString().slice(-7)}`;
  const hiddenRecordTest = await api(baseUrl, `/settings/webhooks/${tenantBWebhook.payload.id}/test`, {
    token: outsiderToken,
    programId: programIds[1],
    method: "POST",
    body: { payload: { name: "Hidden record", phone: hiddenRecordTestPhone } },
  });
  equal(hiddenRecordTest.status, 200, "Admin test vẫn được tạo Lead mới theo quyền quản lý webhook.");
  equal(hiddenRecordTest.payload.data.record_id, undefined, "Admin test không được trả ID Lead nếu người dùng không có scope xem Lead đó.");

  const rejectInput = { ...webhookInput, duplicatePolicy: "REJECT" };
  equal(
    (
      await api(baseUrl, `/settings/webhooks/${webhookId}`, {
        token: managerToken,
        programId: programIds[0],
        method: "PATCH",
        body: rejectInput,
      })
    ).status,
    200,
    "Phải cập nhật được policy REJECT.",
  );
  const rejected = await api(baseUrl, `/webhooks/${key}`, {
    secret,
    method: "POST",
    body: { name: "Rejected", phone: updatePhone },
  });
  equal(rejected.status, 409, "REJECT duplicate phải trả 409.");
  equal(
    rejected.payload.error.code,
    "DUPLICATE_RECORD",
    "REJECT phải trả error code ổn định.",
  );
  check(
    rejected.payload.error.duplicate_record_id === undefined,
    "Public API không được lộ duplicate record id.",
  );
  equal(
    await prisma.leads.count({
      where: {
        institution_program_id: programIds[0],
        phone: updatePhone,
        deleted_at: null,
      },
    }),
    1,
    "REJECT không được create/update Lead.",
  );
  const testedRejected = await api(
    baseUrl,
    `/settings/webhooks/${webhookId}/test`,
    {
      token: managerToken,
      programId: programIds[0],
      method: "POST",
      body: { payload: { name: "Rejected in admin test", phone: updatePhone } },
    },
  );
  equal(
    testedRejected.status,
    409,
    "Admin test phải áp dụng chính sách REJECT thật.",
  );
  equal(
    testedRejected.payload.error.duplicate_record_id,
    updateCreated.payload.data.record_id,
    "Admin test chỉ được trả duplicate record trong scope Lead của người dùng.",
  );

  const customWebhookInput = {
    ...webhookInput,
    name: "Custom fields",
    duplicatePolicy: "UPDATE_EXISTING",
    mappings: [
      ...webhookInput.mappings,
      {
        incomingKey: "need",
        crmField: `custom:${customFields[0].id}`,
        isRequired: false,
        defaultValue: null,
      },
      {
        incomingKey: "budget",
        crmField: `custom:${customFields[1].id}`,
        isRequired: false,
        defaultValue: null,
      },
      {
        incomingKey: "channel",
        crmField: `custom:${customFields[2].id}`,
        isRequired: false,
        defaultValue: null,
      },
      {
        incomingKey: "appointment_date",
        crmField: `custom:${customFields[4].id}`,
        isRequired: false,
        defaultValue: null,
      },
    ],
  };
  const customWebhook = await api(baseUrl, "/settings/webhooks", {
    token: managerToken,
    programId: programIds[0],
    method: "POST",
    body: customWebhookInput,
  });
  equal(customWebhook.status, 201, "Phải tạo webhook có custom field mapping.");
  webhookIds.push(customWebhook.payload.id);
  const customPhone = `096${Date.now().toString().slice(-7)}`;
  const customAccepted = await api(
    baseUrl,
    `/webhooks/${customWebhook.payload.webhookKey}`,
    {
      secret: customWebhook.payload.secret,
      method: "POST",
      body: {
        name: "Custom Lead",
        phone: customPhone,
        need: "Tư vấn",
        budget: 12000000,
        channel: "ONLINE",
        appointment_date: "2026-09-15",
      },
    },
  );
  equal(
    customAccepted.status,
    200,
    "Custom text/number/select hợp lệ phải được lưu.",
  );
  const customValues = await prisma.custom_field_values.findMany({
    where: {
      entity_type: "LEAD",
      entity_id: customAccepted.payload.data.record_id,
    },
  });
  equal(
    customValues.find((value) => value.custom_field_id === customFields[0].id)
      ?.value_text,
    "Tư vấn",
    "Custom text phải lưu đúng.",
  );
  equal(
    Number(
      customValues.find((value) => value.custom_field_id === customFields[1].id)
        ?.value_number,
    ),
    12000000,
    "Custom number phải lưu đúng.",
  );
  equal(
    customValues.find((value) => value.custom_field_id === customFields[2].id)
      ?.value_text,
    "ONLINE",
    "Custom select phải lưu đúng.",
  );
  equal(
    customValues
      .find((value) => value.custom_field_id === customFields[4].id)
      ?.value_date?.toISOString()
      .slice(0, 10),
    "2026-09-15",
    "Custom date hợp lệ phải lưu đúng ngày.",
  );
  const invalidSelectPhone = `097${Date.now().toString().slice(-7)}`;
  const invalidSelect = await api(
    baseUrl,
    `/webhooks/${customWebhook.payload.webhookKey}`,
    {
      secret: customWebhook.payload.secret,
      method: "POST",
      body: {
        name: "Bad select",
        phone: invalidSelectPhone,
        channel: "INVALID",
      },
    },
  );
  equal(
    invalidSelect.payload.error.code,
    "INVALID_FIELD_VALUE",
    "Custom select sai option phải bị từ chối.",
  );
  equal(
    await prisma.leads.count({
      where: {
        institution_program_id: programIds[0],
        phone: invalidSelectPhone,
      },
    }),
    0,
    "Custom field lỗi phải rollback Lead creation.",
  );
  const invalidDatePhone = `088${Date.now().toString().slice(-7)}`;
  const invalidDate = await api(
    baseUrl,
    `/webhooks/${customWebhook.payload.webhookKey}`,
    {
      secret: customWebhook.payload.secret,
      method: "POST",
      body: {
        name: "Bad date",
        phone: invalidDatePhone,
        channel: "ONLINE",
        appointment_date: "2026-02-31",
      },
    },
  );
  equal(
    invalidDate.payload.error.code,
    "INVALID_FIELD_VALUE",
    "Custom date không tồn tại phải bị từ chối thay vì tự chuẩn hóa.",
  );
  await prisma.custom_fields.update({
    where: { id: customFields[4].id },
    data: { is_required: true },
  });
  const missingRequiredCustomPhone = `087${Date.now().toString().slice(-7)}`;
  const missingRequiredCustom = await api(
    baseUrl,
    `/webhooks/${customWebhook.payload.webhookKey}`,
    {
      secret: customWebhook.payload.secret,
      method: "POST",
      body: {
        name: "Missing required custom",
        phone: missingRequiredCustomPhone,
        channel: "ONLINE",
      },
    },
  );
  equal(
    missingRequiredCustom.payload.error.code,
    "MISSING_REQUIRED_FIELD",
    "Custom field bắt buộc phải được kiểm tra theo metadata thực tế khi tạo Lead.",
  );
  equal(
    await prisma.leads.count({
      where: {
        institution_program_id: programIds[0],
        phone: missingRequiredCustomPhone,
      },
    }),
    0,
    "Thiếu custom field bắt buộc không được tạo Lead.",
  );
  await prisma.custom_fields.update({
    where: { id: customFields[4].id },
    data: { is_required: false },
  });

  const beforeMissing = await prisma.leads.count({
    where: { owner_id: manager.id },
  });
  const missing = await api(baseUrl, `/webhooks/${key}`, {
    secret,
    method: "POST",
    body: { name: "Missing phone" },
  });
  equal(missing.status, 400, "Thiếu required field phải trả 400.");
  equal(
    missing.payload.error.code,
    "MISSING_REQUIRED_FIELD",
    "Thiếu field phải có error code đúng.",
  );
  equal(
    await prisma.leads.count({ where: { owner_id: manager.id } }),
    beforeMissing,
    "Validation fail không được tạo Lead.",
  );

  const invalid = await api(baseUrl, `/webhooks/${key}`, {
    secret,
    method: "POST",
    body: { name: "Invalid phone", phone: "abc" },
  });
  equal(
    invalid.payload.error.code,
    "INVALID_FIELD_VALUE",
    "Sai type phải bị từ chối.",
  );

  equal(
    (
      await api(baseUrl, `/settings/webhooks/${webhookId}/status`, {
        token: managerToken,
        programId: programIds[0],
        method: "PATCH",
        body: { status: "DISABLED" },
      })
    ).status,
    200,
    "Disable webhook phải thành công.",
  );
  equal(
    (
      await api(baseUrl, `/webhooks/${key}`, {
        secret,
        method: "POST",
        body: { name: "Disabled", phone: "0901000002" },
      })
    ).status,
    403,
    "Webhook disabled phải bị từ chối.",
  );
  await api(baseUrl, `/settings/webhooks/${webhookId}/status`, {
    token: managerToken,
    programId: programIds[0],
    method: "PATCH",
    body: { status: "ACTIVE" },
  });
  equal(
    (
      await api(baseUrl, `/settings/webhooks/${webhookId}/status`, {
        token: viewerToken,
        programId: programIds[0],
        method: "PATCH",
        body: { status: "DISABLED" },
      })
    ).status,
    403,
    "Quyền view không được đổi trạng thái.",
  );

  const regenerated = await api(
    baseUrl,
    `/settings/webhooks/${webhookId}/regenerate-secret`,
    { token: managerToken, programId: programIds[0], method: "POST" },
  );
  equal(regenerated.status, 200, "Regenerate secret phải thành công.");
  equal(
    (
      await api(baseUrl, `/webhooks/${key}`, {
        secret,
        method: "POST",
        body: { name: "Old secret", phone: "0901000003" },
      })
    ).status,
    401,
    "Secret cũ phải mất hiệu lực.",
  );

  const phone2 = `092${Date.now().toString().slice(-7)}`;
  equal(
    (
      await api(baseUrl, `/webhooks/${key}`, {
        secret: regenerated.payload.secret,
        method: "POST",
        body: { name: "New secret", phone: phone2, utm_source: "Website" },
      })
    ).status,
    200,
    "Secret mới phải hoạt động.",
  );
  const testPhone = `093${Date.now().toString().slice(-7)}`;
  const tested = await api(baseUrl, `/settings/webhooks/${webhookId}/test`, {
    token: managerToken,
    programId: programIds[0],
    method: "POST",
    body: { payload: { name: "Test endpoint", phone: testPhone } },
  });
  equal(tested.status, 200, "Test endpoint phải dùng cùng pipeline.");
  const testedLead = await prisma.leads.findUniqueOrThrow({
    where: { id: tested.payload.data.record_id },
    select: { source_id: true },
  });
  equal(
    testedLead.source_id,
    sourceIds[0],
    "Default Website phải resolve thành Website đăng ký.",
  );

  const invalidJsonResponse = await fetch(`${baseUrl}/webhooks/${key}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": regenerated.payload.secret,
    },
    body: "{",
  });
  equal(invalidJsonResponse.status, 400, "JSON lỗi cú pháp phải trả 400.");
  const wrongTypeResponse = await fetch(`${baseUrl}/webhooks/${key}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "X-Webhook-Secret": regenerated.payload.secret,
    },
    body: "plain",
  });
  equal(
    wrongTypeResponse.status,
    415,
    "Content-Type khác JSON phải bị từ chối.",
  );
  const oversizedResponse = await fetch(`${baseUrl}/webhooks/${key}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": regenerated.payload.secret,
    },
    body: JSON.stringify({ value: "x".repeat(300 * 1024) }),
  });
  equal(oversizedResponse.status, 413, "Payload vượt 256 KB phải bị từ chối.");
  const sensitivePayload = {
    name: "Sensitive",
    phone: "invalid",
    password: "pw",
    auth: { access_token: "nested-token", api_key: "nested-key" },
    webhook_secret: regenerated.payload.secret,
  };
  const sensitiveResponse = await api(baseUrl, `/webhooks/${key}`, {
    secret: regenerated.payload.secret,
    method: "POST",
    body: sensitivePayload,
  });
  equal(
    sensitiveResponse.status,
    400,
    "Payload nhạy cảm dùng dữ liệu sai phải được log an toàn.",
  );

  const limiter = createWebhookRateLimiter(2, 60_000);
  equal(limiter("known", 1), false, "Rate limiter phải cho request đầu.");
  equal(limiter("known", 2), false, "Rate limiter phải cho request thứ hai.");
  equal(
    limiter("known", 3),
    true,
    "Rate limiter phải chặn trước secret verification khi vượt ngưỡng.",
  );

  const logs = await api(baseUrl, `/settings/webhooks/${webhookId}/logs`, {
    token: viewerToken,
    programId: programIds[0],
  });
  equal(logs.status, 200, "Quyền view phải xem được logs.");
  check(
    logs.payload.data.some((item: JsonRecord) => item.status === "SUCCEEDED"),
    "Phải ghi log success.",
  );
  check(
    logs.payload.data.some((item: JsonRecord) => item.status === "FAILED"),
    "Phải ghi log failure.",
  );
  check(
    logs.payload.data.some(
      (item: JsonRecord) => item.errorCode === "PAYLOAD_TOO_LARGE",
    ),
    "Payload quá lớn phải được ghi log.",
  );
  check(
    logs.payload.data.some((item: JsonRecord) => item.action === "UPDATED"),
    "Log phải phân biệt action UPDATED.",
  );
  const rejectedLog = logs.payload.data.find(
    (item: JsonRecord) => item.action === "REJECTED",
  );
  check(
    Boolean(rejectedLog?.duplicateRecordId),
    "Log REJECTED phải lưu duplicate record trong cùng tenant.",
  );
  const acceptedLog = logs.payload.data.find(
    (item: JsonRecord) => item.requestId === accepted.payload.data.request_id,
  );
  const acceptedLogDetail = await api(
    baseUrl,
    `/settings/webhooks/${webhookId}/logs/${acceptedLog.id}`,
    { token: viewerToken, programId: programIds[0] },
  );
  equal(
    typeof acceptedLogDetail.payload.mappedPayload.graduationYear,
    "number",
    "Mapped payload phải lưu number sau type conversion.",
  );
  const sensitiveLog = logs.payload.data.find(
    (item: JsonRecord) => item.errorCode === "INVALID_FIELD_VALUE",
  );
  const sensitiveLogDetail = await api(
    baseUrl,
    `/settings/webhooks/${webhookId}/logs/${sensitiveLog.id}`,
    { token: viewerToken, programId: programIds[0] },
  );
  equal(
    sensitiveLogDetail.payload.payload.password,
    "[REDACTED]",
    "Password phải được mask.",
  );
  equal(
    sensitiveLogDetail.payload.payload.auth.access_token,
    "[REDACTED]",
    "Nested access token phải được mask recursive.",
  );
  equal(
    sensitiveLogDetail.payload.payload.auth.api_key,
    "[REDACTED]",
    "Nested API key phải được mask recursive.",
  );
  check(
    JSON.stringify(sensitiveLogDetail.payload).indexOf(
      regenerated.payload.secret,
    ) === -1,
    "Secret không được xuất hiện trong request log.",
  );
  equal(
    (
      await api(
        baseUrl,
        `/settings/webhooks/${webhookId}/logs/${logs.payload.data[0].id}`,
        { token: outsiderToken, programId: programIds[1] },
      )
    ).status,
    404,
    "Tenant khác không được xem log detail.",
  );

  const oldRequestId = randomUUID();
  const recentRequestId = randomUUID();
  await prisma.webhook_requests.createMany({
    data: [
      {
        webhook_id: second.payload.id,
        request_id: oldRequestId,
        status: "FAILED",
        action: "FAILED",
        payload: {},
        response_code: 400,
        processing_time_ms: 0,
        received_at: new Date("2026-01-01T00:00:00.000Z"),
        processed_at: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        webhook_id: second.payload.id,
        request_id: recentRequestId,
        status: "FAILED",
        action: "FAILED",
        payload: {},
        response_code: 400,
        processing_time_ms: 0,
        received_at: new Date("2026-09-14T00:00:00.000Z"),
        processed_at: new Date("2026-09-14T00:00:00.000Z"),
      },
    ],
  });
  const retentionResult = await cleanupExpiredWebhookLogs(
    30,
    new Date("2026-09-15T00:00:00.000Z"),
    second.payload.id,
  );
  check(
    retentionResult.deletedCount >= 1,
    "Retention phải xóa log quá 30 ngày.",
  );
  equal(
    await prisma.webhook_requests.count({
      where: { request_id: oldRequestId },
    }),
    0,
    "Log cũ phải bị cleanup.",
  );
  equal(
    await prisma.webhook_requests.count({
      where: { request_id: recentRequestId },
    }),
    1,
    "Log gần đây phải được giữ lại.",
  );

  equal(
    (
      await api(baseUrl, `/settings/webhooks/${webhookId}`, {
        token: managerToken,
        programId: programIds[0],
        method: "DELETE",
      })
    ).status,
    200,
    "Delete webhook phải thành công.",
  );
  equal(
    (
      await api(baseUrl, `/webhooks/${key}`, {
        secret: regenerated.payload.secret,
        method: "POST",
        body: { name: "Deleted", phone: "0901000004" },
      })
    ).status,
    404,
    "Webhook đã xóa phải trả 404.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await cleanup();
    await prisma.$disconnect();
    if (!process.exitCode)
      console.log(
        `Inbound webhook integration verified with ${assertions} assertions.`,
      );
  });
