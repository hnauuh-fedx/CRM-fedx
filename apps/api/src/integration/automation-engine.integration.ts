import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { hash } from "bcryptjs";

type JsonRecord = Record<string, any>;
type PrismaHandle = typeof import("../database/prisma.js")["prisma"];

const runId = randomUUID().slice(0, 8);
const password = `Automation-${runId}`;
const actorRoleCode = `AUTO_ACTOR_${runId}`.toUpperCase();
const targetRoleCode = `AUTO_TARGET_${runId}`.toUpperCase();
const scopedRoleCode = `AUTO_SCOPED_${runId}`.toUpperCase();
const notificationTitle = `[AUTOMATION ${runId}] Thông báo nhánh đúng`;
const activityContent = `[AUTOMATION ${runId}] Hoàn tất nhánh đúng`;
const delayedActivityContent = `[AUTOMATION ${runId}] Hoàn tất sau delay`;

const permissionDefinitions = [
  { code: "automation.manage", name: "Quản lý Rule Automation", module: "system" },
  { code: "audit.view", name: "Xem audit log", module: "system" },
  { code: "lead.view_all", name: "Xem toàn bộ lead", module: "lead" },
  { code: "lead.view_assigned", name: "Xem lead được phân công", module: "lead" },
  { code: "lead.update_all", name: "Cập nhật toàn bộ lead", module: "lead" },
  { code: "lead.assign", name: "Phân công lead", module: "lead" },
  { code: "lead_activity.create", name: "Ghi hoạt động chăm sóc lead", module: "lead" },
] as const;

let prisma: PrismaHandle;
let ruleId: string | null = null;
let pipelineId: string | null = null;
const stageIds: string[] = [];
const leadIds: string[] = [];
const userIds: string[] = [];
const roleIds: string[] = [];
const permissionSnapshots: Array<{ id: string; existed: boolean; isActive: boolean | null }> = [];

async function request(
  baseUrl: string,
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    payload: (await response.json().catch(() => ({}))) as JsonRecord,
  };
}

async function login(baseUrl: string, email: string) {
  const result = await request(baseUrl, "/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(result.status, 200, `Đăng nhập ${email} phải thành công.`);
  assert.equal(typeof result.payload.accessToken, "string", "Login phải trả access token.");
  return result.payload.accessToken as string;
}

async function waitForExecution(baseUrl: string, token: string, executionId: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await request(baseUrl, `/automations/${ruleId}/logs/${executionId}`, { token });
    assert.equal(result.status, 200, "Phải đọc được execution qua API.");
    if (["completed", "failed"].includes(result.payload.status)) return result.payload;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`Execution ${executionId} không kết thúc trong thời gian chờ.`);
}

async function waitForDelayedCheckpoint(baseUrl: string, token: string, executionId: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await request(baseUrl, `/automations/${ruleId}/logs/${executionId}`, { token });
    assert.equal(result.status, 200, "Phải đọc được execution đang delay qua API.");
    const delayNode = result.payload.nodes.find((node: JsonRecord) => node.nodeId === "delay");
    if (delayNode?.status === "completed") return result.payload;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Execution ${executionId} không đi vào trạng thái delay đúng hạn.`);
}

async function ensurePermission(definition: typeof permissionDefinitions[number]) {
  const existing = await prisma.permissions.findUnique({ where: { code: definition.code } });
  if (existing) {
    permissionSnapshots.push({ id: existing.id, existed: true, isActive: existing.is_active });
    if (existing.is_active !== true) {
      return prisma.permissions.update({ where: { id: existing.id }, data: { is_active: true } });
    }
    return existing;
  }
  const created = await prisma.permissions.create({ data: { ...definition, is_active: true } });
  permissionSnapshots.push({ id: created.id, existed: false, isActive: null });
  return created;
}

async function createFixtures() {
  const permissions = await Promise.all(permissionDefinitions.map(ensurePermission));
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));
  const [actorRole, targetRole, scopedRole] = await Promise.all([
    prisma.roles.create({ data: { code: actorRoleCode, name: `Automation Actor ${runId}` } }),
    prisma.roles.create({ data: { code: targetRoleCode, name: `Automation Target ${runId}` } }),
    prisma.roles.create({ data: { code: scopedRoleCode, name: `Automation Scoped ${runId}` } }),
  ]);
  roleIds.push(actorRole.id, targetRole.id, scopedRole.id);
  await prisma.role_permissions.createMany({ data: [
    ...permissions
      .filter((permission) => permission.code !== "lead.view_assigned")
      .map((permission) => ({ role_id: actorRole.id, permission_id: permission.id })),
    ...["automation.manage", "lead.view_assigned"].map((code) => ({
      role_id: scopedRole.id,
      permission_id: permissionByCode.get(code)!.id,
    })),
  ] });

  const passwordHash = await hash(password, 10);
  const [actor, target, scoped] = await Promise.all([
    prisma.users.create({
      data: {
        email: `automation.actor.${runId}@example.test`,
        password_hash: passwordHash,
        full_name: `Automation Actor ${runId}`,
        status: "active",
      },
    }),
    prisma.users.create({
      data: {
        email: `automation.target.${runId}@example.test`,
        password_hash: passwordHash,
        full_name: `Automation Target ${runId}`,
        status: "active",
      },
    }),
    prisma.users.create({
      data: {
        email: `automation.scoped.${runId}@example.test`,
        password_hash: passwordHash,
        full_name: `Automation Scoped ${runId}`,
        status: "active",
      },
    }),
  ]);
  userIds.push(actor.id, target.id, scoped.id);
  await prisma.user_roles.createMany({
    data: [
      { user_id: actor.id, role_id: actorRole.id },
      { user_id: target.id, role_id: targetRole.id },
      { user_id: scoped.id, role_id: scopedRole.id },
    ],
  });
  await prisma.user_access_scopes.createMany({
    data: [
      { user_id: actor.id, scope: "ALL" },
      { user_id: target.id, scope: "ALL" },
      { user_id: scoped.id, scope: "ASSIGNED_ONLY" },
    ],
  });

  const pipeline = await prisma.pipelines.create({
    data: { name: `Automation Pipeline ${runId}`, module: "lead" },
  });
  pipelineId = pipeline.id;
  const [initialStage, targetStage] = await Promise.all([
    prisma.pipeline_stages.create({
      data: { pipeline_id: pipeline.id, name: `Ban đầu ${runId}`, position: 1 },
    }),
    prisma.pipeline_stages.create({
      data: { pipeline_id: pipeline.id, name: `Đã tự động ${runId}`, position: 2 },
    }),
  ]);
  stageIds.push(initialStage.id, targetStage.id);

  const [matchingLead, nonMatchingLead] = await Promise.all([
    prisma.leads.create({
      data: {
        full_name: `Automation Matching Lead ${runId}`,
        phone: `091${Date.now().toString().slice(-7)}`,
        status: "new",
        pipeline_stage_id: initialStage.id,
      },
    }),
    prisma.leads.create({
      data: {
        full_name: `Automation Non-matching Lead ${runId}`,
        phone: `092${(Date.now() + 1).toString().slice(-7)}`,
        status: "closed",
        pipeline_stage_id: initialStage.id,
      },
    }),
  ]);
  leadIds.push(matchingLead.id, nonMatchingLead.id);
  return { actor, target, scoped, initialStage, targetStage, matchingLead, nonMatchingLead };
}

function automationGraph(targetUserId: string, targetStageId: string) {
  return {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Lead được tạo", triggerType: "lead_created" } },
      { id: "condition", type: "condition", position: { x: 250, y: 0 }, data: { label: "Lead mới", field: "status", operator: "equals", value: "new" } },
      { id: "notification", type: "action_notification", position: { x: 500, y: -120 }, data: { label: "Thông báo", title: notificationTitle, content: "Rule integration đã chạy nhánh đúng.", targetRole: targetRoleCode } },
      { id: "assign", type: "action_assign", position: { x: 750, y: -120 }, data: { label: "Phân công", assignToUserId: targetUserId } },
      { id: "stage", type: "action_update_stage", position: { x: 1000, y: -120 }, data: { label: "Đổi pipeline", stageId: targetStageId } },
      { id: "activity", type: "action_activity", position: { x: 1250, y: -120 }, data: { label: "Ghi hoạt động", activityType: "automation_integration", activityContent } },
      { id: "delay", type: "delay", position: { x: 500, y: 160 }, data: { label: "Chờ nhánh sai", delayMinutes: 1 } },
      { id: "delayed_activity", type: "action_activity", position: { x: 750, y: 160 }, data: { label: "Ghi sau delay", activityType: "automation_integration_delay", activityContent: delayedActivityContent } },
      { id: "terminal_delay", type: "delay", position: { x: 1000, y: 160 }, data: { label: "Delay kết thúc", delayMinutes: 1 } },
    ],
    edges: [
      { id: "e-trigger-condition", source: "trigger", target: "condition" },
      { id: "e-condition-true", source: "condition", target: "notification", sourceHandle: "default" },
      { id: "e-condition-false", source: "condition", target: "delay", sourceHandle: "false" },
      { id: "e-delay-activity", source: "delay", target: "delayed_activity" },
      { id: "e-activity-terminal-delay", source: "delayed_activity", target: "terminal_delay" },
      { id: "e-notification-assign", source: "notification", target: "assign" },
      { id: "e-assign-stage", source: "assign", target: "stage" },
      { id: "e-stage-activity", source: "stage", target: "activity" },
    ],
  };
}

async function cleanup() {
  if (!prisma) return;
  if (ruleId) await prisma.automation_rules.deleteMany({ where: { id: ruleId } });
  await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.notifications.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.user_access_scopes.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  await prisma.role_permissions.deleteMany({ where: { role_id: { in: roleIds } } });
  await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
  for (const permission of permissionSnapshots) {
    if (permission.existed) {
      await prisma.permissions.update({ where: { id: permission.id }, data: { is_active: permission.isActive } });
    } else {
      await prisma.permissions.deleteMany({ where: { id: permission.id } });
    }
  }
  await prisma.pipeline_stages.deleteMany({ where: { id: { in: stageIds } } });
  if (pipelineId) await prisma.pipelines.deleteMany({ where: { id: pipelineId } });
}

async function main() {
  process.env.NODE_ENV = "integration";
  process.env.AUTOMATION_QUEUE_NAME = `automation_integration_${runId}`;
  process.env.AUTOMATION_DELAY_MS_PER_MINUTE = "1000";
  delete process.env.DISABLE_AUTOMATION_WORKER;
  ({ prisma } = await import("../database/prisma.js"));
  const [{ app }, engine, { redisConnection }] = await Promise.all([
    import("../app.js"),
    import("../modules/automations/automation-engine.service.js"),
    import("../config/redis.js"),
  ]);
  assert.ok(engine.automationQueue && engine.automationWorker && redisConnection, "Integration test yêu cầu Redis và worker thật.");
  await redisConnection.ping();

  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const fixtures = await createFixtures();
    const [actorToken, targetToken, scopedToken] = await Promise.all([
      login(baseUrl, fixtures.actor.email),
      login(baseUrl, fixtures.target.email),
      login(baseUrl, fixtures.scoped.email),
    ]);

    assert.equal((await request(baseUrl, "/automations")).status, 401, "Thiếu xác thực phải bị từ chối.");
    assert.equal(
      (await request(baseUrl, "/automations", { token: targetToken })).status,
      403,
      "Thiếu automation.manage phải bị từ chối.",
    );

    const created = await request(baseUrl, "/automations", {
      token: actorToken,
      method: "POST",
      body: {
        name: `[INTEGRATION ${runId}] Automation node actions`,
        triggerType: "lead_created",
        graphData: automationGraph(fixtures.target.id, fixtures.targetStage.id),
      },
    });
    assert.equal(created.status, 201, "Actor có quyền phải tạo được rule.");
    ruleId = created.payload.id as string;

    const validation = await request(baseUrl, `/automations/${ruleId}/validate`, {
      token: actorToken,
      method: "POST",
      body: {},
    });
    assert.equal(validation.status, 200, "Graph đầy đủ phải hợp lệ.");
    assert.equal(validation.payload.valid, true);

    const activation = await request(baseUrl, `/automations/${ruleId}/toggle`, {
      token: actorToken,
      method: "PATCH",
      body: { isActive: true },
    });
    assert.equal(activation.status, 200, "Rule hợp lệ phải bật được.");
    assert.equal(activation.payload.isActive, true, "API bật rule phải trả hợp đồng camelCase.");

    const outOfScopeRun = await request(baseUrl, `/automations/${ruleId}/test-run`, {
      token: scopedToken,
      method: "POST",
      body: { leadId: fixtures.matchingLead.id },
    });
    assert.equal(outOfScopeRun.status, 404, "Actor ngoài scope không được chạy rule với Lead chưa được phân công.");

    const matchingRun = await request(baseUrl, `/automations/${ruleId}/test-run`, {
      token: actorToken,
      method: "POST",
      body: { leadId: fixtures.matchingLead.id },
    });
    assert.equal(matchingRun.status, 202, "Lead khớp điều kiện phải được nhận chạy thử.");
    const matchingExecution = await waitForExecution(baseUrl, actorToken, matchingRun.payload.executionId);
    assert.equal(matchingExecution.status, "completed");
    assert.equal(matchingExecution.source, "manual_test");
    assert.deepEqual(
      matchingExecution.nodes.map((node: JsonRecord) => node.nodeId).sort(),
      ["activity", "assign", "condition", "notification", "stage"],
      "Nhánh đúng phải chạy đủ action và không chạy delay.",
    );
    assert.ok(matchingExecution.nodes.every((node: JsonRecord) => node.status === "completed" && node.attemptCount === 1));

    const matchingLead = await request(baseUrl, `/leads/${fixtures.matchingLead.id}`, { token: actorToken });
    assert.equal(matchingLead.status, 200);
    assert.equal(matchingLead.payload.data.assignments[0]?.assignee?.id, fixtures.target.id, "Action assign phải đổi người phụ trách.");
    assert.equal(matchingLead.payload.data.stageHistory[0]?.toStage?.id, fixtures.targetStage.id, "Action stage phải ghi lịch sử pipeline.");
    assert.equal(
      matchingLead.payload.data.activities.filter((activity: JsonRecord) => activity.type === "lead_assigned").length,
      1,
      "Action assign phải ghi timeline activity.",
    );
    assert.equal(
      matchingLead.payload.data.activities.filter((activity: JsonRecord) => activity.type === "pipeline_stage_changed").length,
      1,
      "Action stage phải ghi timeline activity.",
    );
    assert.equal(
      matchingLead.payload.data.activities.filter((activity: JsonRecord) => activity.content === activityContent).length,
      1,
      "Action activity phải chỉ ghi đúng một lần.",
    );

    const targetNotifications = await request(baseUrl, "/notifications?page=1&limit=50", { token: targetToken });
    assert.equal(targetNotifications.status, 200);
    assert.equal(
      targetNotifications.payload.data.filter((notification: JsonRecord) => notification.title === notificationTitle).length,
      1,
      "Action notification phải gửi đúng một thông báo tới role đích.",
    );
    assert.equal(
      targetNotifications.payload.data.filter((notification: JsonRecord) => notification.type === "lead_assignment").length,
      1,
      "Action assign phải gửi thông báo phân công.",
    );

    const leadAudits = await request(
      baseUrl,
      `/audit-logs?page=1&limit=100&sortBy=createdAt&sortOrder=desc&search=${fixtures.matchingLead.id}`,
      { token: actorToken },
    );
    assert.equal(leadAudits.status, 200);
    const leadAuditActions = new Set(leadAudits.payload.data.map((audit: JsonRecord) => audit.action));
    assert.ok(leadAuditActions.has("assign"), "Action assign phải ghi audit.");
    assert.ok(leadAuditActions.has("pipeline_stage_changed"), "Action stage phải ghi audit.");
    assert.ok(leadAuditActions.has("automation_activity_created"), "Action activity phải ghi audit.");

    const nonMatchingRun = await request(baseUrl, `/automations/${ruleId}/test-run`, {
      token: actorToken,
      method: "POST",
      body: { leadId: fixtures.nonMatchingLead.id },
    });
    assert.equal(nonMatchingRun.status, 202, "Lead không khớp vẫn phải chạy nhánh false.");
    const delayedCheckpoint = await waitForDelayedCheckpoint(baseUrl, actorToken, nonMatchingRun.payload.executionId);
    assert.equal(delayedCheckpoint.status, "processing", "Execution phải tiếp tục chờ sau khi node delay hoàn tất.");
    assert.deepEqual(
      delayedCheckpoint.nodes.map((node: JsonRecord) => node.nodeId).sort(),
      ["condition", "delay"],
      "Action sau delay không được chạy trước hạn.",
    );
    const nonMatchingExecution = await waitForExecution(baseUrl, actorToken, nonMatchingRun.payload.executionId);
    assert.equal(nonMatchingExecution.status, "completed");
    assert.deepEqual(
      nonMatchingExecution.nodes.map((node: JsonRecord) => node.nodeId).sort(),
      ["condition", "delay", "delayed_activity", "terminal_delay"],
      "Nhánh false phải tiếp tục sau delay và hoàn tất tại delay terminal.",
    );
    assert.ok(nonMatchingExecution.nodes.every((node: JsonRecord) => node.status === "completed" && node.attemptCount === 1));

    const nonMatchingLead = await request(baseUrl, `/leads/${fixtures.nonMatchingLead.id}`, { token: actorToken });
    assert.equal(nonMatchingLead.status, 200);
    assert.equal(nonMatchingLead.payload.data.assignments.length, 0, "Nhánh false không được phân công Lead.");
    assert.equal(nonMatchingLead.payload.data.stageHistory.length, 0, "Nhánh false không được đổi pipeline.");
    assert.equal(
      nonMatchingLead.payload.data.activities.filter((activity: JsonRecord) => activity.content === activityContent).length,
      0,
      "Nhánh false không được ghi activity của nhánh đúng.",
    );
    assert.equal(
      nonMatchingLead.payload.data.activities.filter((activity: JsonRecord) => activity.content === delayedActivityContent).length,
      1,
      "Action sau delay phải chạy đúng một lần sau hạn.",
    );

    const logs = await request(baseUrl, `/automations/${ruleId}/logs?page=1&limit=20`, { token: actorToken });
    assert.equal(logs.status, 200);
    assert.equal(logs.payload.pagination.total, 2, "Rule phải có đủ hai execution quan sát được qua API.");
    assert.ok(logs.payload.data.every((log: JsonRecord) => log.status === "completed" && log.version === 1));

    console.log("Automation integration passed: API, Redis worker, branching and all action nodes verified.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await engine.automationWorker?.close();
    await engine.automationQueue?.obliterate({ force: true });
    await engine.automationQueue?.close();
    await redisConnection?.quit();
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
