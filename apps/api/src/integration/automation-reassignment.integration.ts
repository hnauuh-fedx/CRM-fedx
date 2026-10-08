import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

let prisma: typeof import("../database/prisma.js")["prisma"];
let createReassignmentMonitor: typeof import("../modules/automations/automation-reassignment.service.js")["createReassignmentMonitor"];
let processReassignmentExpiry: typeof import("../modules/automations/automation-reassignment.service.js")["processReassignmentExpiry"];
let getAutomationOperationalMetrics: typeof import("../modules/automations/automation-observability.service.js")["getAutomationOperationalMetrics"];

const runId = randomUUID();
const userIds: string[] = [];
const roleIds: string[] = [];
const leadIds: string[] = [];
const assignmentIds: string[] = [];
const ruleIds: string[] = [];
let departmentId: string | null = null;

const policy = {
  enabled: true,
  interactionCriterion: "not_opened_since_assignment" as const,
  timeoutMinutes: 60,
  assignToAnotherSale: true,
  excludeCurrentAssignee: true as const,
  maxReassignments: 3,
  recyclePool: false,
  maxPoolCycles: 1,
  warningEnabled: false,
  warningBeforeMinutes: 30,
  warningContent: "Vui lòng mở Lead trước thời hạn.",
  notifyOnRemoval: true,
};

async function cleanup() {
  if (!prisma) return;
  if (userIds.length) {
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.notifications.deleteMany({ where: { user_id: { in: userIds } } });
  }
  if (leadIds.length) {
    await prisma.automation_reassignment_monitors.deleteMany({ where: { lead_id: { in: leadIds } } });
    await prisma.lead_activities.deleteMany({ where: { lead_id: { in: leadIds } } });
    await prisma.lead_assignments.deleteMany({ where: { lead_id: { in: leadIds } } });
    await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  }
  if (ruleIds.length) await prisma.automation_rules.deleteMany({ where: { id: { in: ruleIds } } });
  if (userIds.length) {
    await prisma.user_departments.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  }
  if (roleIds.length) await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
  if (departmentId) await prisma.departments.deleteMany({ where: { id: departmentId } });
}

async function main() {
  process.env.NODE_ENV = "integration";
  process.env.DISABLE_REDIS = "true";
  process.env.DISABLE_AUTOMATION_WORKER = "true";
  ({ prisma } = await import("../database/prisma.js"));
  ({ createReassignmentMonitor, processReassignmentExpiry } = await import("../modules/automations/automation-reassignment.service.js"));
  ({ getAutomationOperationalMetrics } = await import("../modules/automations/automation-observability.service.js"));

  const program = await prisma.institution_programs.findFirst({
    where: { status: "active" },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  assert.ok(program, "Integration test yêu cầu ít nhất một chương trình đang hoạt động.");
  const permissions = await prisma.permissions.findMany({
    where: { code: { in: ["lead.assign", "lead.reassign", "lead.view_department", "lead.view_assigned"] } },
    select: { id: true, code: true },
  });
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  for (const code of ["lead.assign", "lead.reassign", "lead.view_department", "lead.view_assigned"]) {
    assert.ok(permissionByCode.has(code), `Thiếu permission ${code} trong dữ liệu integration.`);
  }

  const department = await prisma.departments.create({
    data: { name: `Phòng Sale reassignment ${runId}`, code: `RS-${runId}`.slice(0, 100) },
    select: { id: true },
  });
  departmentId = department.id;
  const [managerRole, saleRole] = await Promise.all([
    prisma.roles.create({ data: { name: `Manager ${runId}`, code: `RM-${runId}`.slice(0, 100) }, select: { id: true } }),
    prisma.roles.create({ data: { name: `Sale ${runId}`, code: `RT-${runId}`.slice(0, 100) }, select: { id: true } }),
  ]);
  roleIds.push(managerRole.id, saleRole.id);
  await prisma.role_access_scopes.createMany({ data: [
    { role_id: managerRole.id, scope_code: "DEPARTMENT" },
    { role_id: saleRole.id, scope_code: "ASSIGNED_ONLY" },
  ] });
  await prisma.role_institution_programs.createMany({ data: [
    { role_id: managerRole.id, institution_program_id: program.id },
    { role_id: saleRole.id, institution_program_id: program.id },
  ] });
  await prisma.role_permissions.createMany({ data: [
    ...["lead.assign", "lead.reassign", "lead.view_department"].map((code) => ({ role_id: managerRole.id, permission_id: permissionByCode.get(code)! })),
    { role_id: saleRole.id, permission_id: permissionByCode.get("lead.view_assigned")! },
  ] });

  const [manager, firstSale, secondSale, thirdSale] = await Promise.all([
    prisma.users.create({ data: { email: `reassignment.manager.${runId}@example.test`, password_hash: "integration-only", full_name: `Manager ${runId}` }, select: { id: true } }),
    prisma.users.create({ data: { email: `reassignment.first.${runId}@example.test`, password_hash: "integration-only", full_name: `Sale 1 ${runId}` }, select: { id: true } }),
    prisma.users.create({ data: { email: `reassignment.second.${runId}@example.test`, password_hash: "integration-only", full_name: `Sale 2 ${runId}` }, select: { id: true } }),
    prisma.users.create({ data: { email: `reassignment.third.${runId}@example.test`, password_hash: "integration-only", full_name: `Sale 3 ${runId}` }, select: { id: true } }),
  ]);
  userIds.push(manager.id, firstSale.id, secondSale.id, thirdSale.id);
  await prisma.user_roles.createMany({ data: [
    { user_id: manager.id, role_id: managerRole.id },
    { user_id: firstSale.id, role_id: saleRole.id },
    { user_id: secondSale.id, role_id: saleRole.id },
    { user_id: secondSale.id, role_id: managerRole.id },
    { user_id: thirdSale.id, role_id: saleRole.id },
  ] });
  await prisma.user_departments.createMany({ data: [manager.id, firstSale.id, secondSale.id, thirdSale.id].map((userId) => ({
    user_id: userId,
    department_id: department.id,
  })) });

  const rule = await prisma.automation_rules.create({
    data: {
      institution_program_id: program.id,
      name: `Rule reassignment ${runId}`,
      trigger_type: "lead_created",
      graph_data: { nodes: [], edges: [] },
      created_by: manager.id,
      is_active: true,
    },
    select: { id: true },
  });
  ruleIds.push(rule.id);

  const createLeadWithMonitor = async (
    suffix: string,
    firstOpenedAt?: Date,
    monitorPolicy = policy,
    assignedAt = new Date(Date.now() - 2 * 60 * 60_000),
  ) => {
    const lead = await prisma.leads.create({
      data: {
        full_name: `Lead reassignment ${suffix} ${runId}`,
        phone: `09${Math.floor(Math.random() * 100_000_000).toString().padStart(8, "0")}`,
        status: "new",
        institution_program_id: program.id,
        owner_id: manager.id,
        assigned_to: firstSale.id,
      },
      select: { id: true },
    });
    leadIds.push(lead.id);
    const assignment = await prisma.lead_assignments.create({
      data: {
        lead_id: lead.id,
        assigned_to: firstSale.id,
        assigned_by: manager.id,
        department_id: department.id,
        assigned_at: assignedAt,
        first_opened_at: firstOpenedAt,
        is_main_owner: true,
      },
      select: { id: true, assigned_at: true },
    });
    assignmentIds.push(assignment.id);
    const monitor = await prisma.$transaction((tx) => createReassignmentMonitor(tx, {
      ruleId: rule.id,
      nodeId: "assign-pool",
      assignment: {
        assignmentId: assignment.id,
        assigneeId: firstSale.id,
        previousAssigneeId: null,
        departmentId: department.id,
        assignedAt: assignment.assigned_at!,
      },
      leadId: lead.id,
      actorId: manager.id,
      institutionProgramId: program.id,
      nodeSnapshot: { assignmentStrategy: "round_robin", assigneeIds: [firstSale.id, secondSale.id, thirdSale.id], departmentId: department.id },
      policy: monitorPolicy,
    }));
    return { lead, assignment, monitor };
  };

  const active = await createLeadWithMonitor("active");
  const concurrentResults = await Promise.all([
    processReassignmentExpiry(active.monitor.id),
    processReassignmentExpiry(active.monitor.id),
  ]);
  assert.ok(concurrentResults.some((result) => result.outcome === "reassigned"));
  const changedLead = await prisma.leads.findUniqueOrThrow({ where: { id: active.lead.id }, select: { assigned_to: true } });
  assert.equal(changedLead.assigned_to, thirdSale.id, "Người có thêm vai trò quản lý phải bị loại khỏi pool Sale dù vẫn có vai trò telesale.");
  const oldMonitor = await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: active.monitor.id } });
  assert.equal(oldMonitor.status, "reassigned");
  assert.ok(oldMonitor.next_assignment_id);
  const successor = await prisma.automation_reassignment_monitors.findFirst({
    where: { assignment_id: oldMonitor.next_assignment_id! },
  });
  assert.ok(successor, "Assignment mới phải có monitor kế tiếp.");
  assert.equal(successor.reassignment_count, 1);
  assert.equal(await prisma.notifications.count({ where: { user_id: firstSale.id, type: "automation_reassignment_removed" } }), 1);
  assert.equal(await prisma.lead_activities.count({ where: { lead_id: active.lead.id, type: "automation_reassignment" } }), 1);
  assert.equal(await prisma.audit_logs.count({ where: { entity_type: "automation_reassignment_monitor", entity_id: active.monitor.id, action: "sale_reassigned" } }), 1);

  await processReassignmentExpiry(active.monitor.id);
  assert.equal(await prisma.lead_assignments.count({ where: { lead_id: active.lead.id } }), 2, "Chạy lại job không được tạo assignment trùng.");

  const warning = await createLeadWithMonitor(
    "warning",
    undefined,
    { ...policy, warningEnabled: true, warningContent: "Lead {{system:fullName}} sắp được chuyển." },
    new Date(Date.now() - 45 * 60_000),
  );
  const { processReassignmentWarning } = await import("../modules/automations/automation-reassignment.service.js");
  await Promise.all([
    processReassignmentWarning(warning.monitor.id),
    processReassignmentWarning(warning.monitor.id),
  ]);
  assert.equal(
    await prisma.notifications.count({ where: { user_id: firstSale.id, type: "automation_reassignment_warning" } }),
    1,
    "Cảnh báo chạy đồng thời vẫn chỉ được gửi một lần.",
  );
  assert.equal((await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: warning.monitor.id } })).status, "warned");
  const warningNotification = await prisma.notifications.findFirstOrThrow({
    where: { user_id: firstSale.id, type: "automation_reassignment_warning" },
    orderBy: { created_at: "desc" },
  });
  assert.ok(warningNotification.content?.includes(`Lead reassignment warning ${runId}`));
  assert.ok(!warningNotification.content?.includes("{{"), "Template token cảnh báo phải được render trước khi gửi.");

  const warningFailure = await createLeadWithMonitor("warning-failure");
  const { recordTerminalReassignmentJobFailure } = await import("../modules/automations/automation-reassignment-queue.service.js");
  await recordTerminalReassignmentJobFailure(
    { monitorId: warningFailure.monitor.id, kind: "warning" },
    new Error("notification provider unavailable"),
  );
  const warningFailureMonitor = await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: warningFailure.monitor.id } });
  assert.equal(warningFailureMonitor.status, "pending", "Cảnh báo thất bại không được vô hiệu hóa job thu hồi.");
  assert.match(warningFailureMonitor.last_error ?? "", /warning_job_failed/);
  assert.equal((await processReassignmentExpiry(warningFailure.monitor.id)).outcome, "reassigned");

  const lateWarning = await createLeadWithMonitor("late-warning", undefined, { ...policy, warningEnabled: true });
  const lateWarningResult = await processReassignmentWarning(lateWarning.monitor.id);
  assert.equal(lateWarningResult.outcome, "expiry_due", "Không được gửi cảnh báo sau khi đã đến hạn chuyển Sale.");

  const opened = await createLeadWithMonitor("opened", new Date());
  await processReassignmentExpiry(opened.monitor.id);
  const openedMonitor = await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: opened.monitor.id } });
  assert.equal(openedMonitor.status, "completed");
  assert.equal(openedMonitor.completion_reason, "lead_opened");
  assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: opened.lead.id }, select: { assigned_to: true } })).assigned_to, firstSale.id);

  const stale = await createLeadWithMonitor("stale");
  await prisma.$transaction(async (tx) => {
    await tx.lead_assignments.update({ where: { id: stale.assignment.id }, data: { is_main_owner: false } });
    const replacement = await tx.lead_assignments.create({
      data: { lead_id: stale.lead.id, assigned_to: secondSale.id, assigned_by: manager.id, department_id: department.id, is_main_owner: true },
      select: { id: true },
    });
    assignmentIds.push(replacement.id);
    await tx.leads.update({ where: { id: stale.lead.id }, data: { assigned_to: secondSale.id } });
  });
  await processReassignmentExpiry(stale.monitor.id);
  const staleMonitor = await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: stale.monitor.id } });
  assert.equal(staleMonitor.status, "cancelled");
  assert.equal(staleMonitor.completion_reason, "stale_assignment");
  assert.equal(await prisma.lead_assignments.count({ where: { lead_id: stale.lead.id } }), 2);

  const metrics = await getAutomationOperationalMetrics({
    id: manager.id,
    email: `reassignment.manager.${runId}@example.test`,
    fullName: `Manager ${runId}`,
    avatarUrl: null,
    roles: [],
    permissions: ["automation.view_logs"],
    departmentIds: [department.id],
    institutionProgramIds: [program.id],
    workingInstitutionProgramId: program.id,
    accessScope: "DEPARTMENT",
  });
  const programMetrics = metrics.reassignment.perProgram.find((item) => item.institutionProgramId === program.id);
  assert.ok(programMetrics, "Metrics phải được nhóm theo chương trình làm việc.");
  assert.ok(programMetrics.reassigned >= 2, "Metrics phải đếm các lượt đã chuyển Sale.");
  assert.ok(programMetrics.warned >= 1, "Metrics phải đếm backlog đã cảnh báo.");
  assert.ok(metrics.reassignment.recent.some((item) => (
    item.id === active.monitor.id
    && item.previousAssignee.id === firstSale.id
    && item.nextAssignee?.id === thirdSale.id
    && item.completionReason === "sale_reassigned"
    && item.delayMs >= 0
  )), "Nhật ký gần đây phải có lý do, Sale cũ/mới và độ trễ.");

  console.log("Automation reassignment integration test passed.");
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
