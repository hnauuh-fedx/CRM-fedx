import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "../database/prisma";
import { redisConnection } from "../config/redis";
import { automationQueue, automationWorker } from "../modules/automations/automation-engine.service";
import type { AuthUser } from "../modules/auth/auth.types";
import { assignLeads } from "../modules/leads/lead-management.service";

const runId = randomUUID().slice(0, 8);
const phoneSeed = Number.parseInt(runId, 16).toString().padStart(8, "0").slice(-8);
const userIds: string[] = [];
const leadIds: string[] = [];

async function cleanup() {
  if (leadIds.length > 0) {
    await prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: { in: leadIds } } });
    await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  }
  if (userIds.length > 0) {
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user_departments.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function run() {
  const [program, department, telesaleRole] = await Promise.all([
    prisma.institution_programs.findFirst({ where: { status: "active" }, select: { id: true } }),
    prisma.departments.findFirst({ select: { id: true } }),
    prisma.roles.findFirst({
      where: {
        role_permissions: {
          some: { permissions: { code: "lead.view_assigned" } },
          none: { permissions: { code: { in: ["lead.view_department", "lead.view_all"] } } },
        },
      },
      select: { id: true },
    }),
  ]);
  assert.ok(program, "Cần một chương trình đang hoạt động để kiểm tra gán sale hàng loạt.");
  assert.ok(department, "Cần một phòng ban để kiểm tra gán sale hàng loạt.");
  assert.ok(telesaleRole, "Cần vai trò Telesale có quyền lead.view_assigned.");

  const [actorUser, assignee] = await Promise.all([
    prisma.users.create({
      data: {
        email: `bulk-assignment-actor-${runId}@example.test`,
        password_hash: "integration-only",
        full_name: "Bulk assignment actor",
        status: "active",
      },
      select: { id: true, email: true, full_name: true, avatar_url: true },
    }),
    prisma.users.create({
      data: {
        email: `bulk-assignment-sale-${runId}@example.test`,
        password_hash: "integration-only",
        full_name: "Bulk assignment sale",
        status: "active",
      },
      select: { id: true },
    }),
  ]);
  userIds.push(actorUser.id, assignee.id);
  await prisma.$transaction([
    prisma.user_roles.create({ data: { user_id: assignee.id, role_id: telesaleRole.id } }),
    prisma.user_departments.create({ data: { user_id: assignee.id, department_id: department.id } }),
  ]);

  const createdLeads = await Promise.all([
    prisma.leads.create({
      data: {
        full_name: `Bulk lead A ${runId}`,
        phone: `09${phoneSeed}`,
        institution_program_id: program.id,
      },
      select: { id: true },
    }),
    prisma.leads.create({
      data: {
        full_name: `Bulk lead B ${runId}`,
        phone: `08${phoneSeed}`,
        institution_program_id: program.id,
      },
      select: { id: true },
    }),
  ]);
  leadIds.push(...createdLeads.map((lead) => lead.id));

  const actor: AuthUser = {
    id: actorUser.id,
    email: actorUser.email,
    fullName: actorUser.full_name,
    avatarUrl: actorUser.avatar_url,
    roles: [],
    permissions: ["lead.assign", "lead.reassign", "lead.view_all"],
    departmentIds: [],
    institutionProgramIds: [program.id],
    accessScope: "ALL",
  };

  const rejected = await assignLeads(actor, [leadIds[0], randomUUID()], { assigneeId: assignee.id }, program.id);
  assert.equal(rejected.ok, false);
  assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: leadIds[0] } })).assigned_to, null);

  const assigned = await assignLeads(actor, leadIds, { assigneeId: assignee.id }, program.id);
  assert.equal(assigned.ok, true);
  if (!assigned.ok) return;
  assert.equal(assigned.data.assignedCount, 2);

  const [leads, assignmentCount, activityCount, auditCount, notificationCount] = await Promise.all([
    prisma.leads.findMany({ where: { id: { in: leadIds } }, select: { assigned_to: true } }),
    prisma.lead_assignments.count({ where: { lead_id: { in: leadIds }, assigned_to: assignee.id, is_main_owner: true } }),
    prisma.lead_activities.count({ where: { lead_id: { in: leadIds }, type: "lead_assigned" } }),
    prisma.audit_logs.count({ where: { entity_type: "lead", entity_id: { in: leadIds }, action: "assign" } }),
    prisma.notifications.count({ where: { user_id: assignee.id, type: "lead_assignment" } }),
  ]);
  assert.equal(leads.every((lead) => lead.assigned_to === assignee.id), true);
  assert.equal(assignmentCount, 2);
  assert.equal(activityCount, 2);
  assert.equal(auditCount, 2);
  assert.equal(notificationCount, 2);

  console.log("Bulk lead assignment is atomic and records assignments, activities, audits, and notifications.");
}

run()
  .finally(async () => {
    await cleanup();
    await automationWorker?.close();
    await automationQueue?.close();
    await redisConnection?.quit();
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
