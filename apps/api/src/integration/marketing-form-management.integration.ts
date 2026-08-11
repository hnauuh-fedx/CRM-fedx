import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { app } from "../app";
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
  options: { token?: string; method?: string; body?: JsonRecord } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
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
    const listed = await request(baseUrl, `/marketing-forms?page=1&limit=20&search=${runId}`, { token: marketingToken });
    const listedForm = (listed.payload.data as Array<{ id: string; mappings: unknown[] }>).find((form) => form.id === createdFormId);
    assert.equal(listedForm?.mappings.length, 3, "Danh sách form phải trả mapping cấu hình.");

    const publicConfig = await request(baseUrl, `/public/forms/${publicKey}`);
    assert.equal(publicConfig.status, 200, "Public form active phải trả cấu hình hiển thị.");
    assert.equal((publicConfig.payload.fields as unknown[]).length, 3);
    const publicSubmit = await request(baseUrl, `/public/forms/${publicKey}/submit`, {
      method: "POST",
      body: {
        customer_name: `Lead public ${runId}`,
        mobile: runPhone,
        contact_email: `public-${runId.toLowerCase()}@example.com`,
      },
    });
    assert.equal(publicSubmit.status, 201, "Public submit phải tạo hoặc ghi nhận lead.");
    createdLeadId = publicSubmit.payload.leadId as string;
    assert.ok(createdLeadId, "Public submit form tư vấn phải tạo lead.");
    assert.equal(await prisma.marketing_form_submissions.count({ where: { marketing_form_id: createdFormId, lead_id: createdLeadId } }), 1);

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
    assert.equal(await prisma.marketing_form_field_mappings.count({ where: { marketing_form_id: createdFormId } }), 2);

    const director = await prisma.users.findUniqueOrThrow({
      where: { email: "director@tvu.edu.vn" },
      select: { id: true },
    });
    const outsideCampaign = await prisma.campaigns.create({
      data: { name: `Campaign form ngoài scope ${runId}`, type: "digital", status: "active", budget: 0, created_by: director.id },
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
    assert.deepEqual(marketingAuditActions, ["create", "delete", "update"]);
    console.log("Marketing form management verified: CRUD, campaign scope, required mappings and audit.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const formId of [createdFormId, directorFormId].filter((value): value is string => Boolean(value))) {
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
