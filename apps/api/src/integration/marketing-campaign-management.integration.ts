import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { app } from "../app";
import { prisma } from "../database/prisma";

type JsonRecord = Record<string, unknown>;

const runId = randomUUID().slice(0, 8).toUpperCase();
let createdCampaignId: string | null = null;
let outsideScopeCampaignId: string | null = null;
let directorCampaignId: string | null = null;

async function request(
  baseUrl: string,
  path: string,
  options: { token?: string; programId?: string; method?: string; body?: JsonRecord } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.programId ? { "X-Institution-Program-Id": options.programId } : {}),
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

async function verifyMarketingCampaignManagement() {
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
    const programsResponse = await request(baseUrl, "/institution-programs/options", { token: marketingToken });
    assert.equal(programsResponse.status, 200);
    const program = (programsResponse.payload.data as Array<{ id: string }>)[0];
    assert.ok(program, "Cần seed chương trình trước khi kiểm thử chiến dịch.");
    const director = await prisma.users.findUniqueOrThrow({
      where: { email: "director@tvu.edu.vn" },
      select: { id: true },
    });
    const outsideScopeCampaign = await prisma.campaigns.create({
      data: {
        name: `Ngoài phạm vi Marketing ${runId}`,
        institution_program_id: program.id,
        type: "digital",
        status: "planning",
        budget: 0,
        created_by: director.id,
      },
      select: { id: true },
    });
    outsideScopeCampaignId = outsideScopeCampaign.id;
    const hiddenResponse = await request(
      baseUrl,
      `/campaigns?page=1&limit=20&search=${encodeURIComponent(runId)}`,
      { token: marketingToken },
    );
    assert.equal(hiddenResponse.status, 200);
    assert.equal((hiddenResponse.payload.data as unknown[]).length, 0, "Marketing không được thấy campaign ngoài phạm vi phòng ban.");
    assert.equal(
      ((await request(baseUrl, `/campaigns?page=1&limit=20&search=${encodeURIComponent(runId)}`, { token: directorToken })).payload.data as unknown[]).length,
      1,
      "Director phải xem được campaign ngoài phạm vi Marketing.",
    );

    const listResponse = await request(baseUrl, "/campaigns?page=1&limit=20", { token: marketingToken });
    assert.equal(listResponse.status, 200);
    const existing = listResponse.payload.data as Array<{
      id: string;
      utmTrackingCount: number;
      leadCount: number;
      applicationCount: number;
      conversionRate: number;
    }>;
    const attributed = existing.find((campaign) => campaign.utmTrackingCount > 0);
    assert.ok(attributed, "Cần chiến dịch mẫu có UTM để kiểm tra chỉ số chuyển đổi.");
    assert.ok(attributed.leadCount > 0);
    assert.equal(typeof attributed.applicationCount, "number");
    assert.equal(typeof attributed.conversionRate, "number");
    assert.equal((await request(baseUrl, "/lead-sources?page=1&limit=20", { token: marketingToken })).status, 200);
    assert.equal((await request(baseUrl, "/utm-trackings?page=1&limit=20", { token: marketingToken })).status, 200);
    assert.equal((await request(baseUrl, "/marketing-forms?page=1&limit=20", { token: marketingToken })).status, 200);
    assert.equal(
      (await request(baseUrl, `/campaigns/${attributed.id}`, { token: marketingToken, method: "DELETE" })).status,
      409,
      "Không được xóa chiến dịch đã phát sinh UTM hoặc biểu mẫu.",
    );

    const directorCreateResponse = await request(baseUrl, "/campaigns", {
      token: directorToken,
      programId: program.id,
      method: "POST",
      body: {
        name: `Chiến dịch giám đốc ${runId}`,
        type: "digital",
        status: "planning",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 50000000,
        institutionProgramId: program.id,
      },
    });
    assert.equal(directorCreateResponse.status, 201, "Giám đốc có quyền riêng phải tạo được chiến dịch.");
    directorCampaignId = directorCreateResponse.payload.id as string;
    assert.equal(
      (await request(baseUrl, `/campaigns/${directorCampaignId}`, {
        token: directorToken,
        programId: program.id,
        method: "PATCH",
        body: {
          name: `Chiến dịch giám đốc đã cập nhật ${runId}`,
          type: "digital",
          status: "active",
          startDate: "2026-06-01",
          endDate: "2026-07-30",
          budget: 60000000,
          institutionProgramId: program.id,
        },
      })).status,
      200,
      "Giám đốc phải cập nhật được chiến dịch toàn hệ thống.",
    );
    assert.equal(
      (await request(baseUrl, `/campaigns/${directorCampaignId}`, { token: directorToken, method: "DELETE" })).status,
      200,
      "Giám đốc phải xóa được chiến dịch chưa phát sinh dữ liệu.",
    );

    const createResponse = await request(baseUrl, "/campaigns", {
      token: marketingToken,
      programId: program.id,
      method: "POST",
      body: {
        name: `Chiến dịch kiểm thử ${runId}`,
        type: "digital",
        status: "planning",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 25000000,
        institutionProgramId: program.id,
      },
    });
    assert.equal(createResponse.status, 201);
    createdCampaignId = createResponse.payload.id as string;

    const updateResponse = await request(baseUrl, `/campaigns/${createdCampaignId}`, {
      token: marketingToken,
      programId: program.id,
      method: "PATCH",
      body: {
        name: `Chiến dịch đã cập nhật ${runId}`,
        type: "event",
        status: "active",
        startDate: "2026-06-01",
        endDate: "2026-07-15",
        budget: 30000000,
        institutionProgramId: program.id,
      },
    });
    assert.equal(updateResponse.status, 200);
    assert.equal(
      (await request(baseUrl, `/campaigns/${createdCampaignId}`, {
        token: marketingToken,
        method: "DELETE",
      })).status,
      200,
    );

    const auditActions = (
      await prisma.audit_logs.findMany({
        where: { entity_type: "campaign", entity_id: createdCampaignId },
        select: { action: true },
      })
    ).map((entry) => entry.action);
    assert.deepEqual(auditActions.sort(), ["create", "delete", "update"]);
    console.log("Marketing campaign management verified: permission, CRUD, dependency protection, conversion metrics and audit.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (createdCampaignId) {
      await prisma.audit_logs.deleteMany({ where: { entity_type: "campaign", entity_id: createdCampaignId } });
      await prisma.campaigns.deleteMany({ where: { id: createdCampaignId } });
    }
    if (directorCampaignId) {
      await prisma.audit_logs.deleteMany({ where: { entity_type: "campaign", entity_id: directorCampaignId } });
      await prisma.campaigns.deleteMany({ where: { id: directorCampaignId } });
    }
    if (outsideScopeCampaignId) {
      await prisma.campaigns.deleteMany({ where: { id: outsideScopeCampaignId } });
    }
    await prisma.$disconnect();
  }
}

verifyMarketingCampaignManagement().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
