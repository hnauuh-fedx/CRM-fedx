import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";

import { app } from "../app";
import { prisma } from "../database/prisma";
import { processReminderNotifications, REMINDER_OVERDUE_DELAY_MS } from "../modules/leads/reminder-notification.service";

type JsonRecord = Record<string, unknown>;

const runId = randomUUID().slice(0, 8);
const phoneSuffix = Number.parseInt(runId, 16).toString().padStart(8, "0").slice(-8);
const primaryPhone = `09${phoneSuffix}`;
const assignedOnCreatePhone = `08${phoneSuffix}`;
const directorCreatedPhone = `07${phoneSuffix}`;
const testPassword = `LeadTest-${runId}`;
const testEmails = {
  manager: `integration.sale-manager.${runId}@example.test`,
  telesale: `integration.telesale.${runId}@example.test`,
  outsider: `integration.outsider.${runId}@example.test`,
};
const testUserIds: string[] = [];
const createdLeadIds: string[] = [];
let leadId: string | null = null;
let server: ReturnType<typeof app.listen> | null = null;
let testInstitutionProgramId: string | null = null;

async function request(
  baseUrl: string,
  path: string,
  options: { token?: string; method?: string; body?: JsonRecord; institutionProgramId?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Connection: "close",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.institutionProgramId ?? testInstitutionProgramId
        ? { "x-institution-program-id": options.institutionProgramId ?? testInstitutionProgramId! }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  return { status: response.status, payload };
}

function requireToken(login: { status: number; payload: JsonRecord }) {
  assert.equal(login.status, 200);
  assert.equal(typeof login.payload.accessToken, "string");
  return login.payload.accessToken as string;
}

async function preparePrincipals() {
  const [saleDepartment, managerRole, telesaleRole, directorRole, source, stages, institutionProgram] = await Promise.all([
    prisma.departments.findUnique({ where: { code: "SALE" }, select: { id: true } }),
    prisma.roles.findUnique({
      where: { code: "SALE_MANAGER" },
      select: { id: true, role_permissions: { select: { permissions: { select: { code: true } } } } },
    }),
    prisma.roles.findFirst({
      where: {
        code: { in: ["TELESALE", "TELESALE_TX"] },
        role_permissions: {
          some: { permissions: { code: "lead.view_assigned" } },
          none: { permissions: { code: "lead.view_department" } },
        },
      },
      select: { id: true, role_permissions: { select: { permissions: { select: { code: true } } } } },
      orderBy: { code: "asc" },
    }),
    prisma.roles.findUnique({ where: { code: "DIRECTOR" }, select: { id: true } }),
    prisma.lead_sources.findFirst({ select: { id: true }, orderBy: { created_at: "asc" } }),
    prisma.pipeline_stages.findMany({ select: { id: true }, orderBy: [{ position: "asc" }, { id: "asc" }], take: 2 }),
    prisma.institution_programs.findFirst({ where: { status: "active" }, select: { id: true }, orderBy: { created_at: "asc" } }),
  ]);

  assert.ok(saleDepartment, "Run seed:sale-access before the integration test.");
  assert.ok(managerRole);
  assert.ok(telesaleRole);
  assert.ok(directorRole);
  assert.ok(source, "A lead source is required to test lead creation.");
  assert.equal(stages.length, 2, "At least two pipeline stages are required.");
  assert.ok(institutionProgram, "An active institution program is required to test lead creation.");

  const managerPermissionCodes = managerRole.role_permissions.flatMap((grant) =>
    grant.permissions ? [grant.permissions.code] : [],
  );
  const telesalePermissionCodes = telesaleRole.role_permissions.flatMap((grant) =>
    grant.permissions ? [grant.permissions.code] : [],
  );
  for (const code of [
    "lead.create",
    "lead.update_department",
    "lead.assign",
    "lead.reassign",
    "custom_field.view",
    "custom_field.create",
    "custom_field.update",
    "custom_field.archive",
    "custom_field.manage_options",
    "custom_field.manage_groups",
  ]) {
    assert.ok(managerPermissionCodes.includes(code), `SALE_MANAGER is missing ${code}.`);
  }
  for (const code of ["lead.update_assigned", "lead_note.create", "lead_activity.create", "lead_activity.update", "reminder.create", "reminder.update", "reminder.complete", "file.upload"]) {
    assert.ok(telesalePermissionCodes.includes(code), `TELESALE is missing ${code}.`);
  }

  const passwordHash = await hash(testPassword, 10);
  const users = await Promise.all(
    Object.entries(testEmails).map(([key, email]) =>
      prisma.users.create({
        data: { email, password_hash: passwordHash, full_name: `Integration ${key}`, status: "active" },
        select: { id: true, email: true },
      }),
    ),
  );
  testUserIds.push(...users.map((user) => user.id));
  const manager = users.find((user) => user.email === testEmails.manager)!;
  const telesale = users.find((user) => user.email === testEmails.telesale)!;
  const outsider = users.find((user) => user.email === testEmails.outsider)!;
  const directorCreator = await prisma.users.create({
    data: {
      email: `integration.director-creator.${runId}@example.test`,
      password_hash: passwordHash,
      full_name: "Integration director creator",
      status: "active",
    },
    select: { id: true },
  });
  testUserIds.push(directorCreator.id);

  await prisma.$transaction([
    prisma.user_roles.createMany({
      data: [
        { user_id: manager.id, role_id: managerRole.id },
        { user_id: telesale.id, role_id: telesaleRole.id },
        { user_id: outsider.id, role_id: telesaleRole.id },
        { user_id: directorCreator.id, role_id: directorRole.id },
      ],
    }),
    prisma.user_departments.createMany({
      data: [
        { user_id: manager.id, department_id: saleDepartment.id },
        { user_id: telesale.id, department_id: saleDepartment.id },
        { user_id: outsider.id, department_id: saleDepartment.id },
      ],
    }),
  ]);

  return {
    saleDepartmentId: saleDepartment.id,
    sourceId: source.id,
    stageIds: stages.map((stage) => stage.id),
    institutionProgramId: institutionProgram.id,
    directorCreatorId: directorCreator.id,
  };
}

async function cleanup() {
  if (createdLeadIds.length > 0) {
    const fileRelations = await prisma.file_relations.findMany({
      where: { entity_type: "lead", entity_id: { in: createdLeadIds } },
      select: { file_id: true },
    });
    const fileIds = fileRelations.flatMap((relation) => (relation.file_id ? [relation.file_id] : []));
    await prisma.$transaction([
      prisma.file_relations.deleteMany({ where: { entity_type: "lead", entity_id: { in: createdLeadIds } } }),
      prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: { in: createdLeadIds } } }),
      prisma.notifications.deleteMany({ where: { user_id: { in: testUserIds } } }),
      prisma.leads.deleteMany({ where: { id: { in: createdLeadIds } } }),
      prisma.files.deleteMany({ where: { id: { in: fileIds } } }),
    ]);
  }
  if (testUserIds.length > 0) {
    await prisma.$transaction([
      prisma.audit_logs.deleteMany({ where: { user_id: { in: testUserIds } } }),
      prisma.notifications.deleteMany({ where: { user_id: { in: testUserIds } } }),
      prisma.user_departments.deleteMany({ where: { user_id: { in: testUserIds } } }),
      prisma.user_roles.deleteMany({ where: { user_id: { in: testUserIds } } }),
      prisma.users.deleteMany({ where: { id: { in: testUserIds } } }),
    ]);
  }
}

async function verifyLeadWorkflow() {
  const fixture = await preparePrincipals();
  testInstitutionProgramId = fixture.institutionProgramId;
  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server!.once("listening", resolve);
    server!.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const [managerLogin, telesaleLogin, outsiderLogin] = await Promise.all(
    Object.values(testEmails).map((email) =>
      request(baseUrl, "/auth/login", { method: "POST", body: { email, password: testPassword } }),
    ),
  );
  const managerToken = requireToken(managerLogin);
  const telesaleToken = requireToken(telesaleLogin);
  const outsiderToken = requireToken(outsiderLogin);

  assert.equal(
    (await request(baseUrl, "/leads", {
      token: telesaleToken,
      method: "POST",
      body: { fullName: "Không được tạo", phone: "0900000000", sourceId: fixture.sourceId },
    })).status,
    403,
  );

  const createResponse = await request(baseUrl, "/leads", {
    token: managerToken,
    method: "POST",
    body: {
      fullName: `Lead kiểm thử ${runId}`,
      phone: primaryPhone,
      sourceId: fixture.sourceId,
      institutionProgramId: fixture.institutionProgramId,
      email: `lead.${runId}@example.test`,
      status: "new",
    },
  });
  assert.equal(createResponse.status, 201);
  assert.equal(typeof createResponse.payload.id, "string");
  leadId = createResponse.payload.id as string;
  createdLeadIds.push(leadId);

  const unassignedLead = await prisma.leads.findUniqueOrThrow({
    where: { id: leadId },
    select: { assigned_to: true, _count: { select: { lead_assignments: true } } },
  });
  assert.equal(unassignedLead.assigned_to, null);
  assert.equal(unassignedLead._count.lead_assignments, 0);

  const directorCreatedLead = await prisma.leads.create({
    data: {
      lead_code: `LD-DIRECTOR-${runId}`,
      full_name: `Lead do Director tạo ${runId}`,
      phone: directorCreatedPhone,
      source_id: fixture.sourceId,
      institution_program_id: fixture.institutionProgramId,
      owner_id: fixture.directorCreatorId,
      assigned_to: null,
      status: "new",
    },
    select: { id: true },
  });
  createdLeadIds.push(directorCreatedLead.id);
  assert.equal(
    (await request(baseUrl, `/leads/${directorCreatedLead.id}`, {
      token: managerToken,
      institutionProgramId: fixture.institutionProgramId,
    })).status,
    200,
    "Sale Manager phải xem được lead chưa phân công do Director tạo trong chương trình được cấp.",
  );

  const actionOptionsResponse = await request(baseUrl, "/leads/action-options", { token: managerToken });
  assert.equal(actionOptionsResponse.status, 200);
  const telesales = actionOptionsResponse.payload.telesales as Array<{ id: string }>;
  assert.ok(telesales.some((user) => user.id === testUserIds[1]));
  assert.ok(!telesales.some((user) => user.id === testUserIds[0]));

  const assignedOnCreateResponse = await request(baseUrl, "/leads", {
    token: managerToken,
    method: "POST",
    body: {
      fullName: `Lead có Sale phụ trách ${runId}`,
      phone: assignedOnCreatePhone,
      sourceId: fixture.sourceId,
      institutionProgramId: fixture.institutionProgramId,
      assigneeId: testUserIds[1],
      status: "new",
    },
  });
  assert.equal(assignedOnCreateResponse.status, 201);
  const assignedOnCreateLeadId = assignedOnCreateResponse.payload.id as string;
  createdLeadIds.push(assignedOnCreateLeadId);
  const assignedOnCreateLead = await prisma.leads.findUniqueOrThrow({
    where: { id: assignedOnCreateLeadId },
    select: { assigned_to: true, _count: { select: { lead_assignments: true } } },
  });
  assert.equal(assignedOnCreateLead.assigned_to, testUserIds[1]);
  assert.equal(assignedOnCreateLead._count.lead_assignments, 1);

  assert.equal((await request(baseUrl, `/leads/${leadId}`, { token: managerToken })).status, 200);
  assert.equal((await request(baseUrl, `/leads/${leadId}`, { token: outsiderToken })).status, 404);

  assert.equal(
    (await request(baseUrl, `/leads/${leadId}`, {
      token: managerToken,
      method: "PATCH",
      body: {
        fullName: `Lead kiểm thử đã sửa ${runId}`,
        phone: primaryPhone,
        sourceId: fixture.sourceId,
        status: "contacted",
        email: `lead.${runId}@example.test`,
      },
    })).status,
    200,
  );
  assert.equal(
    (await request(baseUrl, `/leads/${leadId}/stage`, {
      token: managerToken,
      method: "PATCH",
      body: { stageId: fixture.stageIds[0] },
    })).status,
    200,
  );
  assert.equal(
    (await request(baseUrl, `/leads/${leadId}/assign`, {
      token: managerToken,
      method: "POST",
      body: { assigneeId: testUserIds[1], departmentId: fixture.saleDepartmentId },
    })).status,
    200,
  );

  assert.equal((await request(baseUrl, `/leads/${leadId}`, { token: telesaleToken })).status, 200);
  assert.equal(
    (await request(baseUrl, `/leads/${leadId}`, {
      token: outsiderToken,
      method: "PATCH",
      body: { fullName: "Ngoài phạm vi", phone: "0900000000", sourceId: fixture.sourceId, status: "new" },
    })).status,
    404,
  );
  assert.equal(
    (await request(baseUrl, `/leads/${leadId}/notes`, {
      token: telesaleToken,
      method: "POST",
      body: { content: "Đã liên hệ và hẹn tư vấn tiếp." },
    })).status,
    201,
  );
  const createActivityResponse = await request(baseUrl, "/sale/activities", {
    token: telesaleToken,
    method: "POST",
    body: { leadId, type: "call", content: "Đã gọi xác nhận nhu cầu tư vấn." },
  });
  assert.equal(createActivityResponse.status, 201);
  const activityId = createActivityResponse.payload.id as string;
  assert.equal(
    (await request(baseUrl, `/sale/activities/${activityId}`, {
      token: telesaleToken,
      method: "PATCH",
      body: { type: "meeting", content: "Đã cập nhật lịch hẹn tư vấn trực tiếp." },
    })).status,
    200,
  );
  assert.equal(
    (await request(baseUrl, "/sale/activities", {
      token: outsiderToken,
      method: "POST",
      body: { leadId, type: "call", content: "Ngoài phạm vi." },
    })).status,
    404,
  );
  const createReminderResponse = await request(baseUrl, "/sale/reminders", {
    token: telesaleToken,
    method: "POST",
    body: {
      leadId,
      title: "Gọi lại xác nhận hồ sơ",
      content: "Nhắc người học bổ sung thông tin.",
      remindAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  assert.equal(createReminderResponse.status, 201);
  const reminderId = createReminderResponse.payload.id as string;
  assert.equal(
    (await request(baseUrl, `/sale/reminders/${reminderId}`, {
      token: telesaleToken,
      method: "PATCH",
      body: {
        title: "Gọi lại xác nhận hồ sơ đã bổ sung",
        content: "Xác minh tài liệu mới.",
        remindAt: new Date(Date.now() + 172_800_000).toISOString(),
      },
    })).status,
    200,
  );
  assert.equal(
    (await request(baseUrl, `/sale/reminders/${reminderId}/complete`, {
      token: telesaleToken,
      method: "PATCH",
    })).status,
    200,
  );
  assert.equal(
    (await request(baseUrl, `/sale/reminders/${reminderId}`, {
      token: outsiderToken,
      method: "PATCH",
      body: {
        title: "Ngoài phạm vi",
        remindAt: new Date(Date.now() + 172_800_000).toISOString(),
      },
    })).status,
    404,
  );
  const overdueReminderResponse = await request(baseUrl, "/sale/reminders", {
    token: telesaleToken,
    method: "POST",
    body: {
      leadId,
      title: "Nhắc việc quá hạn kiểm thử",
      content: "Kiểm tra thông báo đến hạn và quá hạn.",
      remindAt: new Date(Date.now() - REMINDER_OVERDUE_DELAY_MS - 60_000).toISOString(),
    },
  });
  assert.equal(overdueReminderResponse.status, 201);
  const overdueReminderId = overdueReminderResponse.payload.id as string;
  await processReminderNotifications(new Date(), [overdueReminderId]);
  await processReminderNotifications(new Date(), [overdueReminderId]);
  const personalNotificationsResponse = await request(baseUrl, "/notifications", { token: telesaleToken });
  assert.equal(personalNotificationsResponse.status, 200);
  const personalNotifications = personalNotificationsResponse.payload.data as Array<{ id: string; type: string; isRead: boolean }>;
  const reminderNotifications = personalNotifications.filter((notification) =>
    ["reminder_due", "reminder_overdue"].includes(notification.type),
  );
  assert.equal(reminderNotifications.length, 2);
  assert.equal(reminderNotifications.every((notification) => !notification.isRead), true);
  assert.equal(
    (await request(baseUrl, `/notifications/${reminderNotifications[0].id}/read`, { token: telesaleToken, method: "PATCH" })).status,
    200,
  );
  const timelineResponse = await request(baseUrl, `/leads/${leadId}`, { token: telesaleToken });
  assert.equal(timelineResponse.status, 200);
  const timelineData = timelineResponse.payload.data as { activities: Array<{ type: string }> };
  const timelineTypes = timelineData.activities.map((activity) => activity.type);
  for (const activity of ["reminder_due", "reminder_overdue"]) {
    assert.ok(timelineTypes.includes(activity), `Timeline activity ${activity} was not returned.`);
  }
  assert.equal(
    (await request(baseUrl, `/leads/${leadId}/files`, {
      token: telesaleToken,
      method: "POST",
      body: {
        fileName: `hoso-${runId}.pdf`,
        fileUrl: `https://storage.example.test/leads/hoso-${runId}.pdf`,
        mimeType: "application/pdf",
        fileSize: 1024,
      },
    })).status,
    201,
  );
  assert.equal(
    (await request(baseUrl, `/leads/${leadId}/stage`, {
      token: telesaleToken,
      method: "PATCH",
      body: { stageId: fixture.stageIds[1] },
    })).status,
    200,
  );
  assert.equal(
    (await request(baseUrl, `/leads/${leadId}`, {
      token: managerToken,
      method: "PATCH",
      body: {
        fullName: `Lead kiểm thử đã sửa ${runId}`,
        phone: primaryPhone,
        sourceId: fixture.sourceId,
        status: "contacted",
        assigneeId: testUserIds[2],
      },
    })).status,
    200,
  );

  const verification = await prisma.leads.findUniqueOrThrow({
    where: { id: leadId },
    select: {
      full_name: true,
      pipeline_stage_id: true,
      assigned_to: true,
      lead_notes: { select: { id: true } },
      lead_activities: { select: { type: true } },
      lead_status_histories: { select: { id: true } },
      reminders: { select: { id: true, status: true, title: true, due_notified_at: true, overdue_notified_at: true } },
    },
  });
  const [auditCount, activityAuditCount, reminderAuditCount, fileRelationCount, notificationCount, reminderNotificationCount] = await Promise.all([
    prisma.audit_logs.count({ where: { entity_type: "lead", entity_id: leadId } }),
    prisma.audit_logs.count({ where: { entity_type: "lead_activity", entity_id: activityId } }),
    prisma.audit_logs.count({ where: { entity_type: "reminder", entity_id: reminderId } }),
    prisma.file_relations.count({ where: { entity_type: "lead", entity_id: leadId } }),
    prisma.notifications.count({ where: { user_id: { in: testUserIds }, type: "lead_assignment" } }),
    prisma.notifications.count({ where: { user_id: testUserIds[1], type: { in: ["reminder_due", "reminder_overdue"] } } }),
  ]);
  const activityTypes = verification.lead_activities.map((activity) => activity.type);
  assert.equal(verification.full_name, `Lead kiểm thử đã sửa ${runId}`);
  assert.equal(verification.pipeline_stage_id, fixture.stageIds[1]);
  assert.equal(verification.assigned_to, testUserIds[2]);
  assert.equal(verification.lead_notes.length, 1);
  for (const activity of ["lead_created", "lead_updated", "pipeline_stage_changed", "lead_assigned", "note_created", "file_attached", "meeting", "reminder_created", "reminder_updated", "reminder_completed", "reminder_due", "reminder_overdue"]) {
    assert.ok(activityTypes.includes(activity), `Activity ${activity} was not recorded.`);
  }
  assert.equal(verification.lead_status_histories.length, 2);
  assert.equal(verification.reminders.length, 2);
  assert.ok(verification.reminders.some((reminder) => reminder.id === reminderId && reminder.status === "done"));
  assert.ok(
    verification.reminders.some(
      (reminder) => reminder.id === overdueReminderId && reminder.due_notified_at && reminder.overdue_notified_at,
    ),
  );
  assert.ok(auditCount >= 7);
  assert.equal(activityAuditCount, 2);
  assert.equal(reminderAuditCount, 3);
  assert.equal(fileRelationCount, 1);
  assert.equal(notificationCount, 3);
  assert.equal(reminderNotificationCount, 2);

  console.log("Lead integration verified: create, update, scope denial, pipeline, notes, files, activities, due/overdue reminders, audit and notifications.");
}

verifyLeadWorkflow()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await cleanup();
    await prisma.$disconnect();
  });
