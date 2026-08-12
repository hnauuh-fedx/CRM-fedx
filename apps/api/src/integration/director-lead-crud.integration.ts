import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";

import { app } from "../app";
import { prisma } from "../database/prisma";

type JsonRecord = Record<string, unknown>;

const runId = randomUUID().slice(0, 8);
const testPassword = `DirectorTest-${runId}`;
const testEmail = `integration.director.${runId}@example.test`;
let testUserId: string | null = null;
let leadId: string | null = null;
let duplicatePhoneLeadId: string | null = null;
let server: ReturnType<typeof app.listen> | null = null;

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
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  return { status: response.status, payload };
}

async function preparePrincipal() {
  const [role, source, institutionProgram, admissionStatus, stages] = await Promise.all([
    prisma.roles.findUnique({
      where: { code: "DIRECTOR" },
      select: { id: true, role_permissions: { select: { permissions: { select: { code: true } } } } },
    }),
    prisma.lead_sources.findFirst({ select: { id: true }, orderBy: { created_at: "asc" } }),
    prisma.institution_programs.findFirst({ select: { id: true }, orderBy: { created_at: "asc" } }),
    prisma.admission_statuses.findFirst({ select: { id: true }, orderBy: { created_at: "asc" } }),
    prisma.pipeline_stages.findMany({ select: { id: true }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 2 }),
  ]);
  assert.ok(role, "Run seed:director-access before the integration test.");
  assert.ok(source, "A lead source is required to test Lead CRUD.");
  assert.ok(institutionProgram, "An institution program is required to test candidate admission data.");
  const major = await prisma.majors.findFirst({
    where: { OR: [{ institution_program_id: institutionProgram.id }, { institution_program_id: null }] },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  assert.ok(major, "A major is required to test candidate admission data.");
  assert.ok(admissionStatus, "An admission status is required to test candidate admission data.");
  assert.equal(stages.length, 2, "Two process stages are required to test selected progress.");
  const permissionCodes = role.role_permissions.flatMap((grant) =>
    grant.permissions ? [grant.permissions.code] : [],
  );
  for (const code of ["lead.view_all", "lead.create", "lead.update_all", "lead.delete"]) {
    assert.ok(permissionCodes.includes(code), `DIRECTOR is missing ${code}.`);
  }

  const user = await prisma.users.create({
    data: {
      email: testEmail,
      password_hash: await hash(testPassword, 10),
      full_name: "Integration Director",
      status: "active",
    },
    select: { id: true },
  });
  testUserId = user.id;
  await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
  return { sourceId: source.id, institutionProgramId: institutionProgram.id, majorId: major.id, admissionStatusId: admissionStatus.id, stageIds: stages.map((stage) => stage.id) };
}

async function cleanup() {
  if (duplicatePhoneLeadId) {
    await prisma.$transaction([
      prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: duplicatePhoneLeadId } }),
      prisma.leads.deleteMany({ where: { id: duplicatePhoneLeadId } }),
    ]);
  }
  if (leadId) {
    await prisma.$transaction([
      prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: leadId } }),
      prisma.file_relations.deleteMany({ where: { entity_type: "lead", entity_id: leadId } }),
      prisma.leads.deleteMany({ where: { id: leadId } }),
    ]);
  }
  if (testUserId) {
    await prisma.$transaction([
      prisma.audit_logs.deleteMany({ where: { user_id: testUserId } }),
      prisma.notifications.deleteMany({ where: { user_id: testUserId } }),
      prisma.user_departments.deleteMany({ where: { user_id: testUserId } }),
      prisma.user_roles.deleteMany({ where: { user_id: testUserId } }),
      prisma.users.deleteMany({ where: { id: testUserId } }),
    ]);
  }
}

async function verifyDirectorLeadCrud() {
  const fixture = await preparePrincipal();
  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server!.once("listening", resolve);
    server!.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const login = await request(baseUrl, "/auth/login", {
    method: "POST",
    body: { email: testEmail, password: testPassword },
  });
  assert.equal(login.status, 200);
  assert.equal(typeof login.payload.accessToken, "string");
  const token = login.payload.accessToken as string;

  assert.equal(
    (await request(baseUrl, "/leads", {
      token,
      method: "POST",
      body: {
        fullName: "Sai số điện thoại",
        phone: "090123456",
        sourceId: fixture.sourceId,
      },
    })).status,
    400,
  );

  assert.equal(
    (await request(baseUrl, "/leads", {
      token,
      method: "POST",
      body: {
        fullName: "Thiếu chương trình tuyển sinh",
        phone: "0909876500",
        sourceId: fixture.sourceId,
      },
    })).status,
    400,
  );

  const createResponse = await request(baseUrl, "/leads", {
    token,
    method: "POST",
    body: {
      fullName: `Lead giám đốc ${runId}`,
      phone: "0909876543",
      sourceId: fixture.sourceId,
      pipelineStageId: fixture.stageIds[0],
      status: "new",
      birthPlace: "Trà Vinh",
      cccdIssueDate: "2024-01-02",
      cccdIssuePlace: "Cục Cảnh sát QLHC",
      graduationYear: "2026",
      diplomaIssuePlace: "Trường THPT Kiểm thử",
      specificAddress: "123 Đường kiểm thử",
      relative1FullName: "Người thân kiểm thử",
      relative1Phone: "0901000000",
      relative1Address: "Địa chỉ người thân",
      institutionProgramId: fixture.institutionProgramId,
      majorId: fixture.majorId,
      admissionStatusId: fixture.admissionStatusId,
      trainingCode: "DT-TEST",
      subjectGroupCode: "A00",
      score1: "8.25",
      gclid: `gclid-${runId}`,
    },
  });
  assert.equal(createResponse.status, 201);
  assert.equal(typeof createResponse.payload.id, "string");
  leadId = createResponse.payload.id as string;

  assert.equal(
    (await request(baseUrl, "/leads", {
      token,
      method: "POST",
      body: {
        fullName: "Lead trùng số điện thoại",
        phone: "0909876543",
        sourceId: fixture.sourceId,
        institutionProgramId: fixture.institutionProgramId,
      },
    })).status,
    409,
  );

  const secondLeadResponse = await request(baseUrl, "/leads", {
    token,
    method: "POST",
    body: {
      fullName: "Lead kiểm tra sửa trùng điện thoại",
      phone: "0909876544",
      sourceId: fixture.sourceId,
      institutionProgramId: fixture.institutionProgramId,
    },
  });
  assert.equal(secondLeadResponse.status, 201);
  duplicatePhoneLeadId = secondLeadResponse.payload.id as string;

  assert.equal(
    (await request(baseUrl, `/leads/${leadId}`, {
      token,
      method: "PATCH",
      body: {
        fullName: `Lead giám đốc ${runId}`,
        phone: "0909876544",
        sourceId: fixture.sourceId,
      },
    })).status,
    409,
  );

  assert.equal(
    (await request(baseUrl, `/leads/${leadId}`, {
      token,
      method: "PATCH",
      body: {
        fullName: "Số điện thoại sửa không hợp lệ",
        phone: "090123456",
        sourceId: fixture.sourceId,
      },
    })).status,
    400,
  );

  assert.equal(
    (await request(baseUrl, `/leads/${leadId}`, {
      token,
      method: "PATCH",
      body: {
        fullName: `Lead giám đốc đã sửa ${runId}`,
        phone: "0909876543",
        sourceId: fixture.sourceId,
        pipelineStageId: fixture.stageIds[1],
        status: "contacted",
        birthPlace: "Vĩnh Long",
        cccdIssueDate: "2024-01-02",
        cccdIssuePlace: "Cục Cảnh sát QLHC",
        graduationYear: "2026",
        diplomaIssuePlace: "Trường THPT Kiểm thử",
        specificAddress: "456 Đường đã sửa",
        relative1FullName: "Người thân kiểm thử",
        relative1Phone: "0901000000",
        relative1Address: "Địa chỉ người thân",
        institutionProgramId: fixture.institutionProgramId,
        majorId: fixture.majorId,
        admissionStatusId: fixture.admissionStatusId,
        trainingCode: "DT-UPDATED",
        subjectGroupCode: "A00",
        score1: "9.00",
        gclid: `gclid-updated-${runId}`,
      },
    })).status,
    200,
  );
  assert.equal((await request(baseUrl, `/leads/${leadId}`, { token, method: "DELETE" })).status, 200);
  assert.equal((await request(baseUrl, `/leads/${leadId}`, { token })).status, 404);

  const lead = await prisma.leads.findUniqueOrThrow({
    where: { id: leadId },
    select: {
      full_name: true,
      deleted_at: true,
      pipeline_stage_id: true,
      student_profiles: { select: { birth_place: true, cccd_issue_place: true, diploma_issue_place: true } },
      addresses: { where: { type: "specific" }, select: { detail_address: true } },
      relatives: { where: { is_primary: true }, select: { full_name: true } },
      admission_profiles: { select: { institution_program_id: true, training_code: true, subject_group_code: true, score_1: true } },
      utm_trackings: { select: { gclid: true } },
      lead_activities: { select: { type: true } },
    },
  });
  const audits = await prisma.audit_logs.findMany({
    where: { entity_type: "lead", entity_id: leadId },
    select: { action: true },
  });
  const activityTypes = lead.lead_activities.map((activity) => activity.type);
  const auditActions = audits.map((audit) => audit.action);

  assert.equal(lead.full_name, `Lead giám đốc đã sửa ${runId}`);
  assert.ok(lead.deleted_at, "Lead delete must be a soft delete.");
  assert.equal(lead.pipeline_stage_id, fixture.stageIds[1]);
  assert.equal(lead.student_profiles?.birth_place, "Vĩnh Long");
  assert.equal(lead.student_profiles?.cccd_issue_place, "Cục Cảnh sát QLHC");
  assert.equal(lead.student_profiles?.diploma_issue_place, "Trường THPT Kiểm thử");
  assert.equal(lead.addresses[0]?.detail_address, "456 Đường đã sửa");
  assert.equal(lead.relatives[0]?.full_name, "Người thân kiểm thử");
  assert.equal(lead.admission_profiles?.institution_program_id, fixture.institutionProgramId);
  assert.equal(lead.admission_profiles?.training_code, "DT-UPDATED");
  assert.equal(lead.admission_profiles?.subject_group_code, "A00");
  assert.equal(lead.admission_profiles?.score_1?.toString(), "9");
  assert.equal(lead.utm_trackings[0]?.gclid, `gclid-updated-${runId}`);
  for (const type of ["lead_created", "lead_updated", "pipeline_stage_changed", "lead_deleted"]) {
    assert.ok(activityTypes.includes(type), `Activity ${type} was not recorded.`);
  }
  for (const action of ["create", "update", "pipeline_stage_changed", "delete"]) {
    assert.ok(auditActions.includes(action), `Audit ${action} was not recorded.`);
  }

  console.log("Director Lead integration verified: ten-digit phone validation, selected progress, candidate profile, admission data, edit, soft delete, activity and audit.");
}

verifyDirectorLeadCrud()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await cleanup();
    await prisma.$disconnect();
  });
