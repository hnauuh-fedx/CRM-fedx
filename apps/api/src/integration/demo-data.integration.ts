import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";

import { prisma } from "../database/prisma";

type Payload = Record<string, unknown>;
const runId = randomUUID().slice(0, 8);
const sensitiveViewerEmail = `integration.sensitive-viewer.${runId}@example.test`;
const sensitiveViewerPassword = `Sensitive-${runId}`;
let sensitiveViewerUserId: string | null = null;
let sensitiveViewerRoleId: string | null = null;

async function request(baseUrl: string, path: string, token?: string, institutionProgramId?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          ...(institutionProgramId ? { "X-Institution-Program-Id": institutionProgramId } : {}),
        }
      : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as Payload;
  assert.equal(response.status, 200, `${path} returned ${response.status}.`);
  return payload;
}

async function login(baseUrl: string, email: string, password = "123456") {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json()) as Payload;
  assert.equal(response.status, 200, `Cannot login with ${email}.`);
  return payload.accessToken as string;
}

function assertData(path: string, payload: Payload, minimum = 1) {
  const data = payload.data as unknown[];
  assert.ok(Array.isArray(data) && data.length >= minimum, `${path} does not contain demo records.`);
}

async function verifyDemoData() {
  process.env.DISABLE_AUTOMATION_WORKER = "true";
  const { app } = await import("../app.js");
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const [directorToken, telesaleToken, marketingToken] = await Promise.all([
      login(baseUrl, "director@tvu.edu.vn"),
      login(baseUrl, "telesale@tvu.edu.vn"),
      login(baseUrl, "marketing@tvu.edu.vn"),
    ]);
    const sensitiveViewerToken = await prepareSensitiveViewer(baseUrl);

    const dashboard = await request(baseUrl, "/dashboard/director", directorToken);
    const summary = dashboard.summary as { totalLeads: number; totalApplications: number; enrolledStudents: number };
    assert.ok(summary.totalLeads >= 6 && summary.totalApplications >= 2 && summary.enrolledStudents >= 1);
    const leadActionOptions = await request(baseUrl, "/leads/action-options", directorToken);
    const progressStages = leadActionOptions.stages as Array<{ id: string; name: string }>;
    const institutionPrograms = leadActionOptions.institutionPrograms as Array<{ id: string; code: string }>;
    assert.ok(institutionPrograms.length >= 2, "Institution program options must contain demo programs.");
    assert.deepEqual(
      progressStages.map((stage) => stage.name),
      ["Đã tiếp nhận (L0)", "Tiếp cận (L1)", "Tư vấn (L2)", "Đăng ký học (L3)", "Hoàn thành (L5)", "Nhập học (L8)", "CSKH", "Fail"],
      "Progress options must contain only the canonical process stages.",
    );
    const enrolledLeads = await request(
      baseUrl,
      `/leads?page=1&limit=20&pipelineStageId=${progressStages[5].id}`,
      directorToken,
    );
    assert.ok((enrolledLeads.data as unknown[]).length >= 1, "Enrolled progress must include demo leads.");
    assert.ok(
      (enrolledLeads.data as Array<{ pipelineStage: { id: string } | null }>).every(
        (lead) => lead.pipelineStage?.id === progressStages[5].id,
      ),
      "Lead list must filter records by selected progress.",
    );
    const enrolledDemoLead = (enrolledLeads.data as Array<{
      leadCode: string | null;
      phone: string | null;
      email?: string | null;
      cccd?: string | null;
      nationality: string | null;
      highSchoolName: string | null;
    }>).find((lead) => lead.leadCode === "DEMO-LD-004");
    assert.equal(enrolledDemoLead?.phone, "0901000004", "Lead list must return contact information fields.");
    assert.equal(enrolledDemoLead?.nationality, "Vi\u1ec7t Nam", "Lead list must return candidate profile fields.");
    assert.equal(enrolledDemoLead?.highSchoolName, "THPT Tr\u00e0 Vinh", "Lead list must return education fields.");
    const primaryProgram = institutionPrograms.find((program) => program.code === "TVU-CQ-2026")!;
    const selectorPrograms = await request(baseUrl, "/institution-programs/options", directorToken);
    assert.ok((selectorPrograms.data as unknown[]).length >= 2, "Topbar selector must receive active institution programs.");
    assertData(
      "/admissions by institution program",
      await request(baseUrl, `/admissions?page=1&limit=20&institutionProgramId=${primaryProgram.id}`, directorToken),
      2,
    );
    assertData(
      "/students by institution program",
      await request(baseUrl, `/students?page=1&limit=20&institutionProgramId=${primaryProgram.id}`, directorToken),
      1,
    );
    await request(baseUrl, `/reports/overview?institutionProgramId=${primaryProgram.id}`, directorToken);

    const scopedLeads = await request(baseUrl, "/leads?page=1&limit=20&search=DEMO-LD", directorToken, primaryProgram.id);
    assert.ok(
      (scopedLeads.data as Array<{ institutionProgram: { id: string } | null }>).every(
        (lead) => lead.institutionProgram?.id === primaryProgram.id,
      ),
      "The selected program header must restrict visible leads.",
    );
    const scopedDashboard = await request(baseUrl, "/dashboard/director", directorToken, primaryProgram.id);
    const scopedSummary = scopedDashboard.summary as { totalLeads: number; totalApplications: number; enrolledStudents: number };
    assert.equal(scopedSummary.totalLeads, 3, "Dashboard must use the selected program context.");
    assert.equal(scopedSummary.totalApplications, 2, "Dashboard applications must use the selected program context.");
    assert.equal(scopedSummary.enrolledStudents, 1, "Dashboard students must use the selected program context.");
    assertData(
      "/sale assignments by selected program",
      await request(baseUrl, "/sale/assignments?page=1&limit=20", directorToken, primaryProgram.id),
      3,
    );

    const directorLists = [
      ["/leads?page=1&limit=20&search=DEMO-LD", 6],
      ["/sale/assignments?page=1&limit=20&search=DEMO-LD", 6],
      ["/sale/activities?page=1&limit=20&search=Nhắc", 1],
      ["/sale/reminders?page=1&limit=20&search=", 4],
      ["/campaigns?page=1&limit=20", 2],
      ["/lead-sources?page=1&limit=20", 3],
      ["/utm-trackings?page=1&limit=20", 3],
      ["/marketing-forms?page=1&limit=20", 2],
      ["/admissions?page=1&limit=20&search=DEMO-HS", 2],
      ["/admissions/documents?page=1&limit=20", 2],
      ["/admissions/statuses?page=1&limit=20", 3],
      ["/admissions/fees?page=1&limit=20&search=DEMO-HS", 2],
      ["/students?page=1&limit=20&search=DEMO-SV", 1],
      ["/students/services?page=1&limit=20", 3],
      ["/students/support-history?page=1&limit=20", 3],
      ["/audit-logs?page=1&limit=20&entityType=reminder", 1],
    ] as const;
    for (const [path, minimum] of directorLists) {
      assertData(path, await request(baseUrl, path, directorToken), minimum);
    }
    await request(baseUrl, "/reports/overview", directorToken);

    const maskedLeadList = await request(baseUrl, "/leads?page=1&limit=20&search=DEMO-LD-001", sensitiveViewerToken);
    const maskedLead = (maskedLeadList.data as Array<{ id: string; phone: string | null; email: string | null; cccd: string | null }>)[0];
    assert.ok(maskedLead, "Sensitive viewer fixture must see demo lead metadata.");
    assert.equal(maskedLead.phone, null, "Lead phone must be masked without lead.sensitive.view.");
    assert.equal(maskedLead.email, null, "Lead email must be masked without lead.sensitive.view.");
    assert.equal(maskedLead.cccd, null, "Lead CCCD must be masked without lead.sensitive.view.");
    const maskedLeadDetail = await request(baseUrl, `/leads/${maskedLead.id}`, sensitiveViewerToken);
    const detailData = maskedLeadDetail.data as { phone: string | null; email: string | null; cccd: string | null };
    assert.equal(detailData.phone, null, "Lead detail phone must be masked without lead.sensitive.view.");
    assert.equal(detailData.email, null, "Lead detail email must be masked without lead.sensitive.view.");
    assert.equal(detailData.cccd, null, "Lead detail CCCD must be masked without lead.sensitive.view.");

    assertData("/leads as telesale", await request(baseUrl, "/leads?page=1&limit=20&search=DEMO-LD", telesaleToken), 4);
    assertData("/sale/reminders as telesale", await request(baseUrl, "/sale/reminders?page=1&limit=20", telesaleToken), 4);
    const notifications = await request(baseUrl, "/notifications?page=1&limit=20", telesaleToken);
    assertData("/notifications as telesale", notifications, 3);

    assertData("/campaigns as marketing", await request(baseUrl, "/campaigns?page=1&limit=20", marketingToken), 2);
    console.log("Demo data verified: dashboard, marketing, sale, admission, student, report, audit and notification APIs are populated.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanupSensitiveViewer();
    await prisma.$disconnect();
  }
}

async function prepareSensitiveViewer(baseUrl: string) {
  const [leadViewPermission, role] = await Promise.all([
    prisma.permissions.upsert({
      where: { code: "lead.view_all" },
      update: { name: "Xem toàn bộ lead", module: "lead", is_active: true },
      create: { code: "lead.view_all", name: "Xem toàn bộ lead", module: "lead", is_active: true },
    }),
    prisma.roles.create({
      data: {
        code: `INTEGRATION_SENSITIVE_${runId.toUpperCase()}`,
        name: "Integration Sensitive Mask Viewer",
      },
      select: { id: true },
    }),
  ]);
  sensitiveViewerRoleId = role.id;
  const user = await prisma.users.create({
    data: {
      email: sensitiveViewerEmail,
      password_hash: await hash(sensitiveViewerPassword, 10),
      full_name: "Integration Sensitive Mask Viewer",
      status: "active",
    },
    select: { id: true },
  });
  sensitiveViewerUserId = user.id;
  await prisma.$transaction([
    prisma.role_permissions.create({ data: { role_id: role.id, permission_id: leadViewPermission.id } }),
    prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } }),
    prisma.user_access_scopes.create({ data: { user_id: user.id, scope: "ALL" } }),
  ]);

  return login(baseUrl, sensitiveViewerEmail, sensitiveViewerPassword);
}

async function cleanupSensitiveViewer() {
  if (!sensitiveViewerUserId && !sensitiveViewerRoleId) return;
  await prisma.$transaction(async (tx) => {
    await tx.audit_logs.deleteMany({
      where: {
        OR: [
          ...(sensitiveViewerUserId ? [{ user_id: sensitiveViewerUserId }, { entity_id: sensitiveViewerUserId }] : []),
          ...(sensitiveViewerRoleId ? [{ entity_id: sensitiveViewerRoleId }] : []),
        ],
      },
    });
    if (sensitiveViewerUserId) {
      await tx.user_access_scopes.deleteMany({ where: { user_id: sensitiveViewerUserId } });
      await tx.user_roles.deleteMany({ where: { user_id: sensitiveViewerUserId } });
      await tx.users.delete({ where: { id: sensitiveViewerUserId } });
    }
    if (sensitiveViewerRoleId) {
      await tx.role_permissions.deleteMany({ where: { role_id: sensitiveViewerRoleId } });
      await tx.user_roles.deleteMany({ where: { role_id: sensitiveViewerRoleId } });
      await tx.roles.delete({ where: { id: sensitiveViewerRoleId } });
    }
  });
}

verifyDemoData().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
