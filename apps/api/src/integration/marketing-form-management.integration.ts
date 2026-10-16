import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

// Import app only after isolating infrastructure; static imports would start workers first.
process.env.NODE_ENV = "test";
process.env.DISABLE_REDIS = "true";
process.env.DISABLE_AUTOMATION_WORKER = "true";
import { prisma } from "../database/prisma";

type JsonRecord = Record<string, unknown>;

const runId = randomUUID().slice(0, 8).toUpperCase();
const runPhone = `090${Date.now().toString().slice(-7)}`;
let createdFormId: string | null = null;
let directorFormId: string | null = null;
let outsideCampaignId: string | null = null;
let createdLeadId: string | null = null;

async function request(
  baseUrl: string,
  path: string,
  options: { token?: string; method?: string; body?: JsonRecord; programId?: string; idempotencyKey?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.programId ? { "X-Institution-Program-Id": options.programId } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return {
    status: response.status,
    payload: (await response.json().catch(() => ({}))) as JsonRecord,
  };
}

async function login(baseUrl: string, email: string) {
  const response = await request(baseUrl, "/auth/login", {
    method: "POST",
    body: { email, password: "123456" },
  });
  assert.equal(response.status, 200, `Không thể đăng nhập tài khoản ${email}.`);
  return response.payload.accessToken as string;
}

function input(name: string, campaignId: string, status: string = "active") {
  return {
    name,
    platform: "website",
    formCode: `FORM-${runId}`,
    campaignId,
    status,
    webhookEnabled: true,
    mappings: [
      { sourceField: "customer_name", leadField: "full_name", isRequired: true },
      { sourceField: "mobile", leadField: "phone", isRequired: true },
      { sourceField: "contact_email", leadField: "email", isRequired: false },
    ],
  };
}

async function verifyMarketingFormManagement() {
  const { app } = await import("../app.js");
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const [directorToken, marketingToken] = await Promise.all([
      login(baseUrl, "director@tvu.edu.vn"),
      login(baseUrl, "marketing@tvu.edu.vn"),
    ]);
    const marketingOptions = await request(baseUrl, "/marketing-forms/options", { token: marketingToken });
    assert.equal(marketingOptions.status, 200);
    const marketingCampaign = (marketingOptions.payload.campaigns as Array<{ id: string }>)[0];
    assert.ok(marketingCampaign, "Cần campaign mẫu thuộc scope Marketing để kiểm thử biểu mẫu.");

    const invalid = await request(baseUrl, "/marketing-forms", {
      token: marketingToken,
      method: "POST",
      body: {
        ...input(`Form thiếu số điện thoại ${runId}`, marketingCampaign.id),
        mappings: [{ sourceField: "customer_name", leadField: "full_name", isRequired: true }],
      },
    });
    assert.equal(invalid.status, 400, "Không được tạo form thiếu mapping lead bắt buộc.");

    const created = await request(baseUrl, "/marketing-forms", {
      token: marketingToken,
      method: "POST",
      body: input(`Form Marketing ${runId}`, marketingCampaign.id),
    });
    assert.equal(created.status, 201);
    createdFormId = created.payload.id as string;
    const publicKey = created.payload.public_key as string;
    const webhookSecret = created.payload.webhookSecret as string;
    assert.ok(publicKey, "Form mới phải có public key.");
    assert.ok(webhookSecret, "Form mới phải trả webhook secret một lần.");
    const formProgramId = (await prisma.marketing_forms.findUniqueOrThrow({ where: { id: createdFormId }, select: { institution_program_id: true } })).institution_program_id!;
    const invalidPublished = await request(baseUrl, `/forms/${createdFormId}`, {
      token: marketingToken, programId: formProgramId, method: "PUT",
      body: { ...input(`Invalid mapping ${runId}`, marketingCampaign.id), mappings: [], fields: [
        { fieldKey: "name", label: "Họ tên", fieldType: "text", crmMappingField: "full_name", isActive: true },
        { fieldKey: "phone", label: "Điện thoại", fieldType: "phone", crmMappingField: "phone", isActive: true },
        { fieldKey: "major", label: "Ngành", fieldType: "select", crmMappingField: "major_id", options: ["Lựa chọn 1"], isActive: true },
      ] },
    });
    assert.equal(invalidPublished.status, 400, "Published generic major mapping must return 400, not Prisma 500.");
    assert.ok((invalidPublished.payload.issues as Array<{ path: unknown[] }>).some((issue) => issue.path[2] === "options"));
    const layout = { version: 1, pages: [{ id: "contact", title: "Thông tin liên hệ" }, { id: "details", title: "Thông tin thêm" }], groups: [{ id: "contact_group", pageId: "contact", title: "Liên hệ" }] };
    const layoutFields = [
      { fieldKey: "customer_name", label: "Họ tên", fieldType: "text", isRequired: true, crmMappingField: "full_name", validationRules: { formLayout: { pageId: "contact", groupId: "contact_group" } } },
      { fieldKey: "mobile", label: "Điện thoại", fieldType: "phone", isRequired: true, crmMappingField: "phone", validationRules: { formLayout: { pageId: "details" } } },
      { fieldKey: "contact_email", label: "Email", fieldType: "email", crmMappingField: "email" },
    ];
    const layoutBody = { ...input(`Form Marketing ${runId}`, marketingCampaign.id), displaySettings: { surveyLayout: layout }, fields: layoutFields };
    const invalidLayout = await request(baseUrl, `/forms/${createdFormId}`, { token: marketingToken, programId: formProgramId, method: "PUT", body: { ...layoutBody, fields: [{ ...layoutFields[0], validationRules: { formLayout: { pageId: "details", groupId: "contact_group" } } }, ...layoutFields.slice(1)] } });
    assert.equal(invalidLayout.status, 400, "Cross-page groups cannot be saved.");
    assert.equal((await request(baseUrl, `/forms/${createdFormId}`, { token: marketingToken, programId: formProgramId, method: "PUT", body: { ...layoutBody, status: "draft", displaySettings: { surveyLayout: { ...layout, pages: [] } } } })).status, 400, "Draft layout is validated too.");
    const savedLayout = await request(baseUrl, `/forms/${createdFormId}`, { token: marketingToken, programId: formProgramId, method: "PUT", body: layoutBody });
    assert.equal(savedLayout.status, 200);
    const persistedLayout = await request(baseUrl, `/forms/${createdFormId}`, { token: marketingToken, programId: formProgramId });
    assert.deepEqual((persistedLayout.payload.displaySettings as JsonRecord).surveyLayout, layout);
    const persistedField = (persistedLayout.payload.fields as Array<{ id: string; fieldKey: string }>).find(field => field.fieldKey === "customer_name")!;
    const beforeInvalidField = await prisma.marketing_form_fields.findUniqueOrThrow({ where: { id: persistedField.id } });
    assert.equal((await request(baseUrl, `/form-fields/${persistedField.id}`, { token: marketingToken, programId: formProgramId, method: "PUT", body: { ...layoutFields[0], validationRules: { formLayout: { pageId: "missing" } } } })).status, 400);
    assert.deepEqual(await prisma.marketing_form_fields.findUniqueOrThrow({ where: { id: persistedField.id } }), beforeInvalidField, "Invalid single-field placement rolls back the entire mutation.");
    const { getAuthUser } = await import("../modules/auth/auth.service.js");
    const directorUser = await prisma.users.findUniqueOrThrow({ where: { email: "director@tvu.edu.vn" }, select: { id: true } });
    const authorizedDirector = await getAuthUser(directorUser.id, formProgramId);
    assert.ok(authorizedDirector);
    const otherProgramId = authorizedDirector.institutionProgramIds.find((id) => id !== formProgramId);
    assert.ok(otherProgramId, "Fixture cần Director có quyền truy cập ít nhất hai chương trình.");
    assert.equal((await request(baseUrl, "/forms/references?target=major_id&limit=101", { token: directorToken, programId: formProgramId })).status, 400);
    assert.equal((await request(baseUrl, "/forms/references?target=source_id", { token: directorToken, programId: randomUUID() })).status, 403);
    assert.equal((await request(baseUrl, "/forms/references?target=major_id", { programId: formProgramId })).status, 401);
    assert.equal((await request(baseUrl, `/forms/${createdFormId}`, { token: directorToken, programId: formProgramId })).status, 200);
    for (const path of [`/forms/${createdFormId}`, `/forms/${createdFormId}/fields`, `/forms/${createdFormId}/submissions`, `/marketing-forms/${createdFormId}/submissions`]) {
      assert.equal((await request(baseUrl, path, { token: directorToken, programId: otherProgramId })).status, 404, "Header chương trình khác không được đọc dữ liệu form.");
    }
    assert.equal((await request(baseUrl, `/forms/${createdFormId}`, { token: directorToken, programId: randomUUID() })).status, 403, "Header chương trình không được cấp phải bị chặn.");
    for (const path of [`/forms/${createdFormId}`, `/marketing-forms/${createdFormId}`]) {
      assert.equal((await request(baseUrl, path, { token: directorToken, programId: otherProgramId, method: "DELETE" })).status, 404);
    }
    const crossProgramList = await request(baseUrl, `/forms?search=${runId}`, { token: directorToken, programId: otherProgramId });
    assert.equal((crossProgramList.payload.data as Array<{ id: string }>).some((row) => row.id === createdFormId), false);
    const listed = await request(baseUrl, `/marketing-forms?page=1&limit=20&search=${runId}`, { token: marketingToken });
    const listedForm = (listed.payload.data as Array<{ id: string; mappings: unknown[] }>).find((form) => form.id === createdFormId);
    assert.equal(listedForm?.mappings.length, 3, "Danh sách form phải trả mapping cấu hình.");

    const publicConfig = await request(baseUrl, `/public/forms/${publicKey}`);
    assert.equal(publicConfig.status, 200, "Public form active phải trả cấu hình hiển thị.");
    assert.equal((publicConfig.payload.fields as unknown[]).length, 3);
    assert.deepEqual((publicConfig.payload.displaySettings as JsonRecord).surveyLayout, layout);
    const missingOtherPage = await request(baseUrl, `/public/forms/${publicKey}/submit`, { method: "POST", body: { customer_name: `Lead public ${runId}` } });
    assert.equal(missingOtherPage.status, 400, "Final submit validates required answers from every page.");
    const submissionKey = randomUUID();
    const publicSubmit = await request(baseUrl, `/public/forms/${publicKey}/submit`, {
      idempotencyKey: submissionKey,
      method: "POST",
      body: {
        customer_name: `Lead public ${runId}`,
        mobile: runPhone,
        contact_email: `public-${runId.toLowerCase()}@example.com`,
      },
    });
    assert.equal(publicSubmit.status, 201, "Public submit phải tạo hoặc ghi nhận lead.");
    assert.equal("leadId" in publicSubmit.payload, false, "Public receipt must not expose a Lead identity.");
    createdLeadId = (await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: publicSubmit.payload.submissionId as string }, select: { lead_id: true } })).lead_id;
    assert.ok(createdLeadId, "Public submit form tư vấn phải tạo lead.");
    const savedSnapshot = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: publicSubmit.payload.submissionId as string }, select: { configuration_snapshot: true } });
    assert.deepEqual((savedSnapshot.configuration_snapshot as JsonRecord).layout, layout);
    assert.equal(await prisma.marketing_form_submissions.count({ where: { marketing_form_id: createdFormId, lead_id: createdLeadId } }), 1);
    const replay = await request(baseUrl, `/public/forms/${publicKey}/submit`, { method: "POST", idempotencyKey: submissionKey, body: { customer_name: `Lead public ${runId}`, mobile: runPhone, contact_email: `public-${runId.toLowerCase()}@example.com` } });
    assert.equal(replay.status, 201); assert.deepEqual(replay.payload, publicSubmit.payload);
    assert.equal(await prisma.marketing_form_submissions.count({ where: { marketing_form_id: createdFormId, lead_id: createdLeadId } }), 1);
    const deniedHistory = await request(baseUrl, `/forms/lead-history/${createdLeadId}`, { programId: formProgramId });
    assert.equal(deniedHistory.status, 401);
    const allowedHistory = await request(baseUrl, `/forms/lead-history/${createdLeadId}`, { token: directorToken, programId: formProgramId });
    assert.equal(allowedHistory.status, 200);
    assert.ok((allowedHistory.payload.data as Array<{ id: string }>).some((item) => item.id === publicSubmit.payload.submissionId));

    const pending = await prisma.marketing_form_submissions.create({ data: { marketing_form_id: createdFormId, status: "needs_review", raw_payload: { phone: runPhone }, normalized_payload: { phone: runPhone }, answers: { fixture: "Preserve this answer" } }, select: { id: true } });
    const reviewPath = `/forms/${createdFormId}/submissions/${pending.id}`;
    assert.equal((await request(baseUrl, `${reviewPath}/resolve`, { method: "POST", body: { action: "ignore", reason: "Fixture" } })).status, 401);
    assert.equal((await request(baseUrl, `${reviewPath}/resolve`, { token: marketingToken, programId: formProgramId, method: "POST", body: { action: "ignore", reason: "Fixture" } })).status, 403);
    assert.equal((await request(baseUrl, `${reviewPath}/resolve`, { token: directorToken, programId: otherProgramId, method: "POST", body: { action: "ignore", reason: "Fixture" } })).status, 404);
    assert.equal((await request(baseUrl, `${reviewPath}/candidates`, { programId: formProgramId })).status, 401);
    assert.equal((await request(baseUrl, `${reviewPath}/candidates`, { token: marketingToken, programId: formProgramId })).status, 403);
    assert.equal((await request(baseUrl, `${reviewPath}/candidates`, { token: directorToken, programId: otherProgramId })).status, 404);
    assert.equal((await request(baseUrl, `${reviewPath}/candidates`, { token: directorToken, programId: randomUUID() })).status, 403);
    const reviewCandidates = await request(baseUrl, `${reviewPath}/candidates`, { token: directorToken, programId: formProgramId });
    assert.equal(reviewCandidates.status, 200); assert.ok((reviewCandidates.payload.data as Array<{ id: string }>).some((row) => row.id === createdLeadId));
    for (const body of [{ action: "link", leadId: createdLeadId, reason: "" }, { action: "ignore", reason: "Fixture", assignedTo: randomUUID() }, { action: "link", leadId: "invalid", reason: "Fixture" }]) {
      assert.equal((await request(baseUrl, `${reviewPath}/resolve`, { token: directorToken, programId: formProgramId, method: "POST", body })).status, 400);
    }
    assert.equal((await request(baseUrl, `${reviewPath}/resolve`, { token: directorToken, programId: formProgramId, method: "POST", body: { action: "link", leadId: randomUUID(), reason: "Fixture" } })).status, 404);
    const decision = { token: directorToken, programId: formProgramId, method: "POST", body: { action: "link", leadId: createdLeadId, reason: "HTTP fixture" } };
    assert.equal((await request(baseUrl, `${reviewPath}/resolve`, decision)).status, 200);
    const repeatedReview = await request(baseUrl, `${reviewPath}/resolve`, decision);
    assert.equal(repeatedReview.status, 200); assert.equal(repeatedReview.payload.replayed, true);
    assert.equal((await request(baseUrl, `${reviewPath}/resolve`, { ...decision, body: { action: "ignore", reason: "Competing decision" } })).status, 409);

    const badWebhook = await request(baseUrl, `/public/webhooks/forms/${publicKey}`, {
      method: "POST",
      body: { customer_name: "Webhook sai secret", mobile: runPhone.replace(/^090/, "091") },
    });
    assert.equal(badWebhook.status, 401, "Webhook thiếu secret phải bị chặn.");

    const updated = await request(baseUrl, `/marketing-forms/${createdFormId}`, {
      token: marketingToken,
      method: "PATCH",
      body: {
        ...input(`Form Marketing cập nhật ${runId}`, marketingCampaign.id, "inactive"),
        mappings: [
          { sourceField: "full_name", leadField: "full_name", isRequired: true },
          { sourceField: "phone_number", leadField: "phone", isRequired: true },
        ],
      },
    });
    assert.equal(updated.status, 200);
    assert.deepEqual((await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: publicSubmit.payload.submissionId as string }, select: { configuration_snapshot: true } })).configuration_snapshot, savedSnapshot.configuration_snapshot, "Later builder updates do not alter historic layout or answers.");
    assert.equal(await prisma.marketing_form_field_mappings.count({ where: { marketing_form_id: createdFormId } }), 2);

    const director = await prisma.users.findUniqueOrThrow({
      where: { email: "director@tvu.edu.vn" },
      select: { id: true },
    });
    const outsideCampaign = await prisma.campaigns.create({
      data: {
        name: `Campaign form ngoài scope ${runId}`, type: "digital", status: "active", created_by: director.id,
        institution_program_id: (await prisma.campaigns.findUniqueOrThrow({ where: { id: marketingCampaign.id }, select: { institution_program_id: true } })).institution_program_id,
      },
      select: { id: true },
    });
    outsideCampaignId = outsideCampaign.id;
    const directorCreated = await request(baseUrl, "/marketing-forms", {
      token: directorToken,
      method: "POST",
      body: input(`Form giám đốc ${runId}`, outsideCampaign.id),
    });
    assert.equal(directorCreated.status, 201, "Giám đốc phải tạo được biểu mẫu.");
    directorFormId = directorCreated.payload.id as string;
    assert.equal(
      (await request(baseUrl, `/marketing-forms/${directorFormId}`, {
        token: directorToken,
        method: "PATCH",
        body: input(`Form giám đốc cập nhật ${runId}`, outsideCampaign.id, "draft"),
      })).status,
      200,
    );
    const hidden = await request(baseUrl, `/marketing-forms?page=1&limit=20&search=${runId}`, { token: marketingToken });
    assert.equal(
      (hidden.payload.data as Array<{ id: string }>).some((form) => form.id === directorFormId),
      false,
      "Marketing không được xem form thuộc campaign ngoài scope.",
    );
    assert.equal(
      (await request(baseUrl, `/marketing-forms/${directorFormId}`, {
        token: marketingToken,
        method: "PATCH",
        body: input(`Không được sửa ${runId}`, outsideCampaign.id),
      })).status,
      404,
      "Marketing không được sửa form ngoài scope.",
    );
    assert.equal((await request(baseUrl, `/marketing-forms/${directorFormId}`, { token: directorToken, method: "DELETE" })).status, 200);
    assert.equal((await request(baseUrl, `/marketing-forms/${createdFormId}`, { token: marketingToken, method: "DELETE" })).status, 200);

    const marketingAuditActions = (
      await prisma.audit_logs.findMany({
        where: { entity_type: "marketing_form", entity_id: createdFormId },
        select: { action: true },
      })
    ).map((entry) => entry.action).sort();
    assert.deepEqual(marketingAuditActions, ["create", "delete", "update", "update"]);
    console.log("Marketing form management verified: CRUD, campaign scope, required mappings and audit.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    for (const formId of [createdFormId, directorFormId].filter((value): value is string => Boolean(value))) {
      const submissionIds = (await prisma.marketing_form_submissions.findMany({ where: { marketing_form_id: formId }, select: { id: true } })).map((row) => row.id);
      await prisma.audit_logs.deleteMany({ where: { entity_type: "marketing_form_submission", entity_id: { in: submissionIds } } });
      await prisma.audit_logs.deleteMany({ where: { entity_type: "marketing_form", entity_id: formId } });
      await prisma.marketing_forms.deleteMany({ where: { id: formId } });
    }
    if (createdLeadId) {
      await prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: createdLeadId } });
      await prisma.leads.deleteMany({ where: { id: createdLeadId } });
    }
    if (outsideCampaignId) {
      await prisma.campaigns.deleteMany({ where: { id: outsideCampaignId } });
    }
    await prisma.$disconnect();
  }
}

verifyMarketingFormManagement().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
