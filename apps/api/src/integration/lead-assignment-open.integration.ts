import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { AuthUser } from "../modules/auth/auth.types.js";

let prisma: typeof import("../database/prisma.js")["prisma"];
let initializeLeadOnOpen: typeof import("../modules/leads/application/open-lead.use-case.js")["initializeLeadOnOpen"];

const runId = randomUUID();
const userIds: string[] = [];
const leadIds: string[] = [];
const assignmentIds: string[] = [];

function actor(
  user: { id: string; email: string; full_name: string },
  programId: string,
  accessScope: AuthUser["accessScope"],
  permissions?: string[],
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    avatarUrl: null,
    roles: [],
    permissions: permissions ?? (accessScope === "ALL"
      ? ["lead.update_all", "lead.view_all"]
      : ["lead.update_assigned", "lead.view_assigned"]),
    departmentIds: [],
    institutionProgramIds: [programId],
    workingInstitutionProgramId: programId,
    accessScope,
  };
}

async function cleanup() {
  if (!prisma) return;
  if (assignmentIds.length > 0) {
    await prisma.audit_logs.deleteMany({
      where: { entity_type: "lead_assignment", entity_id: { in: assignmentIds } },
    });
  }
  if (leadIds.length > 0) {
    await prisma.lead_activities.deleteMany({ where: { lead_id: { in: leadIds } } });
    await prisma.lead_assignments.deleteMany({ where: { lead_id: { in: leadIds } } });
    await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  }
  if (userIds.length > 0) {
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function main() {
  process.env.NODE_ENV = "integration";
  process.env.DISABLE_REDIS = "true";
  process.env.DISABLE_AUTOMATION_WORKER = "true";
  ({ prisma } = await import("../database/prisma.js"));
  ({ initializeLeadOnOpen } = await import("../modules/leads/application/open-lead.use-case.js"));

  const program = await prisma.institution_programs.findFirst({
    where: { status: "active" },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  assert.ok(program, "Integration test yêu cầu ít nhất một chương trình đang hoạt động.");

  const stage = await prisma.pipeline_stages.findFirst({
    select: { id: true },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  assert.ok(stage, "Integration test yêu cầu ít nhất một bước pipeline.");

  const [firstSale, secondSale, manager] = await Promise.all([
    prisma.users.create({
      data: {
        email: `assignment.open.first.${runId}@example.test`,
        password_hash: "integration-only",
        full_name: `Sale thứ nhất ${runId}`,
        status: "active",
      },
      select: { id: true, email: true, full_name: true },
    }),
    prisma.users.create({
      data: {
        email: `assignment.open.second.${runId}@example.test`,
        password_hash: "integration-only",
        full_name: `Sale thứ hai ${runId}`,
        status: "active",
      },
      select: { id: true, email: true, full_name: true },
    }),
    prisma.users.create({
      data: {
        email: `assignment.open.manager.${runId}@example.test`,
        password_hash: "integration-only",
        full_name: `Quản lý ${runId}`,
        status: "active",
      },
      select: { id: true, email: true, full_name: true },
    }),
  ]);
  userIds.push(firstSale.id, secondSale.id, manager.id);

  const lead = await prisma.leads.create({
    data: {
      full_name: `Lead kiểm thử mở bản ghi ${runId}`,
      phone: `09${Date.now().toString().slice(-8)}`,
      status: "new",
      pipeline_stage_id: stage.id,
      institution_program_id: program.id,
      owner_id: manager.id,
      assigned_to: firstSale.id,
    },
    select: { id: true },
  });
  leadIds.push(lead.id);

  const firstAssignment = await prisma.lead_assignments.create({
    data: {
      lead_id: lead.id,
      assigned_to: firstSale.id,
      assigned_by: manager.id,
      is_main_owner: true,
    },
    select: { id: true },
  });
  assignmentIds.push(firstAssignment.id);

  const managerOpen = await initializeLeadOnOpen(
    actor(manager, program.id, "ALL"),
    lead.id,
    program.id,
    "127.0.0.1",
  );
  assert.equal(managerOpen.ok, true);
  assert.equal(managerOpen.ok && managerOpen.data.assignmentOpened, false, "Quản lý mở bản ghi không được tính thay sale.");
  assert.equal(
    (await prisma.lead_assignments.findUniqueOrThrow({
      where: { id: firstAssignment.id },
      select: { first_opened_at: true },
    })).first_opened_at,
    null,
    "Manager mở assignment chưa được sale mở không được ghi thời điểm thay sale.",
  );

  const firstOpen = await initializeLeadOnOpen(
    actor(firstSale, program.id, "ASSIGNED_ONLY", ["lead.view_assigned"]),
    lead.id,
    program.id,
    "127.0.0.1",
  );
  assert.equal(firstOpen.ok, true);
  assert.equal(firstOpen.ok && firstOpen.data.assignmentOpened, true, "Lần mở đầu tiên phải đánh dấu assignment.");

  const duplicateOpen = await initializeLeadOnOpen(
    actor(firstSale, program.id, "ASSIGNED_ONLY"),
    lead.id,
    program.id,
    "127.0.0.1",
  );
  assert.equal(duplicateOpen.ok, true);
  assert.equal(duplicateOpen.ok && duplicateOpen.data.assignmentOpened, false, "Mở lại không được ghi nhận lần đầu lần nữa.");

  const persistedFirstAssignment = await prisma.lead_assignments.findUniqueOrThrow({
    where: { id: firstAssignment.id },
    select: { first_opened_at: true },
  });
  assert.ok(persistedFirstAssignment.first_opened_at, "Assignment hiện tại phải lưu thời điểm mở đầu tiên.");
  assert.equal(
    await prisma.lead_activities.count({ where: { lead_id: lead.id, type: "lead_opened" } }),
    1,
    "Mỗi assignment chỉ được ghi một hoạt động mở lần đầu.",
  );
  assert.equal(
    await prisma.audit_logs.count({
      where: { entity_type: "lead_assignment", entity_id: firstAssignment.id, action: "first_open" },
    }),
    1,
    "Mỗi assignment chỉ được ghi một audit mở lần đầu.",
  );

  const secondAssignment = await prisma.$transaction(async (tx) => {
    await tx.lead_assignments.update({
      where: { id: firstAssignment.id },
      data: { is_main_owner: false },
    });
    await tx.leads.update({
      where: { id: lead.id },
      data: { assigned_to: secondSale.id },
    });
    return tx.lead_assignments.create({
      data: {
        lead_id: lead.id,
        assigned_to: secondSale.id,
        assigned_by: manager.id,
        is_main_owner: true,
      },
      select: { id: true },
    });
  });
  assignmentIds.push(secondAssignment.id);

  const reassignedOpen = await initializeLeadOnOpen(
    actor(secondSale, program.id, "ASSIGNED_ONLY"),
    lead.id,
    program.id,
    "127.0.0.1",
  );
  assert.equal(reassignedOpen.ok, true);
  assert.equal(reassignedOpen.ok && reassignedOpen.data.assignmentOpened, true, "Assignment mới phải có vòng theo dõi độc lập.");

  const assignments = await prisma.lead_assignments.findMany({
    where: { id: { in: [firstAssignment.id, secondAssignment.id] } },
    select: { id: true, first_opened_at: true },
  });
  assert.ok(assignments.every((item) => item.first_opened_at), "Cả hai vòng phân công phải giữ lịch sử mở riêng.");

  console.log("Lead assignment first-open integration test passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    if (prisma) await prisma.$disconnect();
  });
