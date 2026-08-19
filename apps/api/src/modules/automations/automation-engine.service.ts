import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";

import { redisConnection } from "../../config/redis";
import { prisma } from "../../database/prisma";
import { getAuthUser } from "../auth/auth.service";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { assignVisibleLead, changeVisibleLeadStage, leadUpdatePermissions } from "../leads/lead-owner-stage-mutations.service";
import { decideNodeExecution } from "./automation-execution-state";
import { validateAutomationGraph } from "./automation-graph.validator";
import { ensureAutomationRuleVersionSnapshot } from "./automation-rule-version.service";
import type { AutomationEdge, AutomationGraphData, AutomationNode } from "./automation.types";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type AutomationContext = {
  ruleId: string;
  actorId?: string;
  leadId?: string;
  studentId?: string;
  institutionProgramId?: string;
  payload?: unknown;
};

export type AutomationExecutionSource = "event" | "manual_test";
export type ExecutableAutomationRule = {
  id: string;
  version: number;
  triggerType: string;
  graphData: AutomationGraphData;
  institutionProgramId: string | null;
  createdBy: string | null;
};
export type ExecutionJobData = {
  context: AutomationContext;
  nodeId: string;
  graph: AutomationGraphData;
  logId: string;
};
type ActionResult = { nextSourceHandle: string | null; delayMinutes: number };

const DEFAULT_AUTOMATION_QUEUE_NAME = "automation_engine_queue";
const DEFAULT_DELAY_MS_PER_MINUTE = 60_000;

export const AUTOMATION_QUEUE_NAME = getAutomationQueueName();
const delayMsPerMinute = getDelayMsPerMinute();
const isAutomationDisabled = process.env.DISABLE_AUTOMATION_WORKER === "true" || process.env.NODE_ENV === "test";

export const automationQueue = isAutomationDisabled
  ? null
  : new Queue<ExecutionJobData>(AUTOMATION_QUEUE_NAME, { connection: redisConnection as any });

async function enqueueAutomationJob(data: ExecutionJobData, delay = 0) {
  if (!automationQueue) throw new UnrecoverableError("Automation worker hiện không khả dụng.");
  await automationQueue.add("execute_node", data, {
    delay,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    jobId: `${data.logId}-${data.nodeId}`,
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function triggerAutomation(triggerType: string, context: Omit<AutomationContext, "ruleId">) {
  if (isAutomationDisabled) return;
  const rules = await prisma.automation_rules.findMany({
    where: {
      is_active: true,
      trigger_type: triggerType,
      OR: [{ institution_program_id: null }, { institution_program_id: context.institutionProgramId }],
    },
    select: {
      id: true,
      version: true,
      trigger_type: true,
      graph_data: true,
      institution_program_id: true,
      created_by: true,
    },
  });
  for (const rule of rules) {
    await startAutomationExecution(
      {
        id: rule.id,
        version: rule.version,
        triggerType: rule.trigger_type,
        graphData: rule.graph_data as unknown as AutomationGraphData,
        institutionProgramId: rule.institution_program_id,
        createdBy: rule.created_by,
      },
      context,
      "event",
      context.actorId ?? null,
    );
  }
}

export async function startAutomationExecution(
  rule: ExecutableAutomationRule,
  context: Omit<AutomationContext, "ruleId">,
  source: AutomationExecutionSource,
  requestedBy: string | null,
) {
  const validation = validateAutomationGraph(rule.graphData);
  if (!validation.valid) return { ok: false as const, reason: "invalid_graph" as const, validation };
  if (!automationQueue) return { ok: false as const, reason: "queue_unavailable" as const };
  const triggerNode = rule.graphData.nodes.find((node) => node.type === "trigger");
  if (!triggerNode) return { ok: false as const, reason: "invalid_graph" as const, validation };

  const version = await ensureAutomationRuleVersionSnapshot({
    ruleId: rule.id,
    version: rule.version,
    triggerType: rule.triggerType,
    graphData: rule.graphData,
    institutionProgramId: rule.institutionProgramId,
    createdBy: rule.createdBy ?? requestedBy,
  });
  const executionContext: AutomationContext = { ...context, ruleId: rule.id };
  const log = await prisma.$transaction(async (tx) => {
    const createdLog = await tx.automation_execution_logs.create({
      data: {
        rule_id: rule.id,
        rule_version_id: version.id,
        requested_by: requestedBy,
        source,
        status: "processing",
        context_data: JSON.parse(JSON.stringify(executionContext)),
      },
      select: { id: true, status: true },
    });
    if (source === "manual_test" && requestedBy) {
      await tx.audit_logs.create({
        data: {
          user_id: requestedBy,
          entity_type: "automation_rule",
          entity_id: rule.id,
          action: "manual_test_run",
          new_data: { leadId: context.leadId, executionId: createdLog.id, version: version.version },
        },
      });
    }
    return createdLog;
  });
  try {
    for (const { nextNodeId } of getNextNodes(triggerNode.id, rule.graphData, null)) {
      await enqueueAutomationJob({ context: executionContext, nodeId: nextNodeId, graph: rule.graphData, logId: log.id });
    }
    return { ok: true as const, data: { executionId: log.id, status: log.status, version: version.version } };
  } catch (error) {
    await prisma.automation_execution_logs.update({
      where: { id: log.id },
      data: { status: "failed", error_message: toErrorMessage(error), completed_at: new Date() },
    });
    throw error;
  }
}

async function processAutomationNode(job: Job<ExecutionJobData>) {
  const { context, nodeId, graph, logId } = job.data;
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new UnrecoverableError(`Không tìm thấy node ${nodeId} trong snapshot.`);

  const persisted = await prisma.automation_node_executions.findUnique({
    where: { execution_log_id_node_id: { execution_log_id: logId, node_id: nodeId } },
    select: { id: true, status: true, next_source_handle: true, delay_minutes: true },
  });
  const decision = decideNodeExecution(persisted ? {
    status: persisted.status,
    nextSourceHandle: persisted.next_source_handle,
    delayMinutes: persisted.delay_minutes,
  } : null);
  if (decision.kind === "already_completed") return;

  const nodeExecution = decision.kind === "execute_action"
    ? await prisma.automation_node_executions.upsert({
        where: { execution_log_id_node_id: { execution_log_id: logId, node_id: nodeId } },
        create: { execution_log_id: logId, node_id: nodeId, node_type: node.type, status: "processing", attempt_count: 1 },
        update: { status: "processing", attempt_count: { increment: 1 }, error_message: null },
        select: { id: true },
      })
    : await prisma.automation_node_executions.update({
        where: { id: persisted!.id },
        data: { attempt_count: { increment: 1 } },
        select: { id: true },
      });

  try {
    const actionResult = decision.kind === "reuse_action_result"
      ? { nextSourceHandle: decision.nextSourceHandle, delayMinutes: decision.delayMinutes }
      : await executeNodeAction(node, context, nodeExecution.id);
    const nextNodes = getNextNodes(node.id, graph, actionResult.nextSourceHandle);
    for (const { nextNodeId } of nextNodes) {
      await enqueueAutomationJob(
        { context, nodeId: nextNodeId, graph, logId },
        actionResult.delayMinutes * delayMsPerMinute,
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.automation_node_executions.update({
        where: { id: nodeExecution.id },
        data: { status: "completed", completed_at: new Date(), error_message: null },
      });
      if (nextNodes.length === 0) {
        await tx.automation_execution_logs.update({
          where: { id: logId },
          data: { status: "completed", completed_at: new Date(), error_message: null },
        });
      }
    });
  } catch (error) {
    await prisma.automation_node_executions.updateMany({
      where: { id: nodeExecution.id, status: { notIn: ["action_completed", "completed"] } },
      data: { status: "failed", error_message: toErrorMessage(error) },
    });
    await prisma.automation_execution_logs.update({
      where: { id: logId },
      data: {
        status: error instanceof UnrecoverableError ? "failed" : "processing",
        error_message: toErrorMessage(error),
        ...(error instanceof UnrecoverableError ? { completed_at: new Date() } : {}),
      },
    });
    throw error;
  }
}

export const automationWorker = isAutomationDisabled
  ? null
  : new Worker<ExecutionJobData>(AUTOMATION_QUEUE_NAME, processAutomationNode, {
      connection: redisConnection as any,
      concurrency: 5,
    });

automationWorker?.on("failed", async (job, error) => {
  console.error(`Automation Job failed: ${job?.id}`, error);
  if (!job?.data.logId) return;
  const attempts = job.opts.attempts ?? 1;
  if (!(error instanceof UnrecoverableError) && job.attemptsMade < attempts) return;
  await prisma.automation_execution_logs.update({
    where: { id: job.data.logId },
    data: { status: "failed", error_message: toErrorMessage(error), completed_at: new Date() },
  }).catch((updateError) => console.error("Không thể cập nhật execution log thất bại", updateError));
});

function getNextNodes(nodeId: string, graph: AutomationGraphData, sourceHandle: string | null) {
  const outgoingEdges = graph.edges.filter((edge: AutomationEdge) => edge.source === nodeId);
  if (sourceHandle === null) return outgoingEdges.map((edge) => ({ nextNodeId: edge.target, handle: edge.sourceHandle }));
  return outgoingEdges
    .filter((edge) => edge.sourceHandle === sourceHandle || (!edge.sourceHandle && sourceHandle === "default"))
    .map((edge) => ({ nextNodeId: edge.target, handle: edge.sourceHandle }));
}

async function executeNodeAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<ActionResult> {
  switch (node.type) {
    case "condition": {
      const result = { nextSourceHandle: await evaluateCondition(node, context) ? "default" : "false", delayMinutes: 0 };
      await markActionCompleted(prisma, nodeExecutionId, result);
      return result;
    }
    case "action_notification": return executeNotificationAction(node, context, nodeExecutionId);
    case "action_assign": return executeAssignAction(node, context, nodeExecutionId);
    case "action_update_stage": return executeUpdateStageAction(node, context, nodeExecutionId);
    case "action_activity": return executeActivityAction(node, context, nodeExecutionId);
    case "delay": {
      const result = { nextSourceHandle: "default", delayMinutes: Number(node.data.delayMinutes ?? 0) };
      await markActionCompleted(prisma, nodeExecutionId, result);
      return result;
    }
    case "trigger": throw new UnrecoverableError("Node khởi động không được thực thi như một action.");
    default: throw new UnrecoverableError(`Loại node không được hỗ trợ: ${String(node.type)}`);
  }
}

async function evaluateCondition(node: AutomationNode, context: AutomationContext): Promise<boolean> {
  const { field, operator, value } = node.data;
  if (!field || !operator || !context.leadId) throw new UnrecoverableError("Node điều kiện thiếu trường, toán tử hoặc lead context.");
  const actor = await requireActor(context);
  const lead = await prisma.leads.findFirst({ where: { id: context.leadId, deleted_at: null, ...getLeadScopeWhere(actor) } });
  if (!lead) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  const actualValue = (lead as Record<string, unknown>)[field];
  const compareValue = String(value);
  const actualString = String(actualValue ?? "");
  switch (operator) {
    case "equals": return actualString === compareValue;
    case "not_equals": return actualString !== compareValue;
    case "contains": return actualString.includes(compareValue);
    case "exists": return actualValue !== null && actualValue !== undefined && actualString !== "";
    default: throw new UnrecoverableError(`Toán tử điều kiện không được hỗ trợ: ${operator}`);
  }
}

async function executeNotificationAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<ActionResult> {
  const { title, content, targetRole } = node.data;
  if (!title || !content || !targetRole) throw new UnrecoverableError("Node thông báo thiếu tiêu đề, nội dung hoặc vai trò nhận.");
  const actor = await requireActor(context);
  const scopeWhere = actor.accessScope === "ALL"
    ? {}
    : actor.accessScope === "DEPARTMENT" && actor.departmentIds.length > 0
      ? { user_departments: { some: { department_id: { in: actor.departmentIds } } } }
      : { id: actor.id };
  const users = await prisma.users.findMany({
    where: { status: "active", deleted_at: null, user_roles: { some: { roles: { code: targetRole } } }, ...scopeWhere },
    select: { id: true },
  });
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  await prisma.$transaction(async (tx) => {
    if (users.length > 0) await tx.notifications.createMany({ data: users.map((user) => ({ user_id: user.id, title, content, type: "system" })) });
    await markActionCompleted(tx, nodeExecutionId, result);
  });
  return result;
}

async function executeAssignAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<ActionResult> {
  const { assignToUserId } = node.data;
  if (!assignToUserId || !context.leadId) throw new UnrecoverableError("Node phân công thiếu nhân viên hoặc lead context.");
  const actor = await requireActor(context);
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const mutation = await assignVisibleLead(actor, context.leadId, { assigneeId: assignToUserId }, context.institutionProgramId, async (tx) => markActionCompleted(tx, nodeExecutionId, result));
  if (!mutation.ok) throw new UnrecoverableError(`Không thể phân công lead: ${mutation.reason}`);
  return result;
}

async function executeUpdateStageAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<ActionResult> {
  const { stageId } = node.data;
  if (!stageId || !context.leadId) throw new UnrecoverableError("Node cập nhật pipeline thiếu giai đoạn hoặc lead context.");
  const actor = await requireActor(context);
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const mutation = await changeVisibleLeadStage(actor, context.leadId, stageId, context.institutionProgramId, async (tx) => markActionCompleted(tx, nodeExecutionId, result));
  if (!mutation.ok) throw new UnrecoverableError(`Không thể đổi giai đoạn lead: ${mutation.reason}`);
  return result;
}

async function executeActivityAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<ActionResult> {
  const { activityType, activityContent } = node.data;
  if (!activityType || !activityContent || !context.leadId) throw new UnrecoverableError("Node hoạt động thiếu loại, nội dung hoặc lead context.");
  const actor = await requireActor(context);
  const canWriteActivity = actor.permissions.includes("lead_activity.create") || leadUpdatePermissions.some((permission) => actor.permissions.includes(permission));
  if (!canWriteActivity) throw new UnrecoverableError("Tài khoản kích hoạt không có quyền ghi hoạt động lead.");
  const lead = await prisma.leads.findFirst({ where: { id: context.leadId, deleted_at: null, ...getLeadScopeWhere(actor) }, select: { id: true } });
  if (!lead) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.lead_activities.create({ data: { lead_id: context.leadId, user_id: actor.id, type: activityType, content: activityContent } });
    await tx.audit_logs.create({
      data: { user_id: actor.id, entity_type: "lead", entity_id: context.leadId, action: "automation_activity_created", new_data: { ruleId: context.ruleId, activityType } },
    });
    await markActionCompleted(tx, nodeExecutionId, result);
  });
  return result;
}

async function markActionCompleted(tx: TransactionClient | typeof prisma, nodeExecutionId: string, result: ActionResult) {
  await tx.automation_node_executions.update({
    where: { id: nodeExecutionId },
    data: {
      status: "action_completed",
      next_source_handle: result.nextSourceHandle,
      delay_minutes: result.delayMinutes,
      action_completed_at: new Date(),
      error_message: null,
    },
  });
}

async function requireActor(context: AutomationContext) {
  if (!context.actorId) throw new UnrecoverableError("Automation context không có tài khoản kích hoạt.");
  const actor = await getAuthUser(context.actorId);
  if (!actor) throw new UnrecoverableError("Tài khoản kích hoạt automation không còn hoạt động.");
  return actor;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getAutomationQueueName() {
  if (process.env.NODE_ENV !== "integration") return DEFAULT_AUTOMATION_QUEUE_NAME;
  const queueName = process.env.AUTOMATION_QUEUE_NAME?.trim() || DEFAULT_AUTOMATION_QUEUE_NAME;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(queueName)) {
    throw new Error("AUTOMATION_QUEUE_NAME integration phải gồm 1-100 ký tự chữ, số, gạch dưới hoặc gạch ngang.");
  }
  return queueName;
}

function getDelayMsPerMinute() {
  if (process.env.NODE_ENV !== "integration") return DEFAULT_DELAY_MS_PER_MINUTE;
  const value = Number(process.env.AUTOMATION_DELAY_MS_PER_MINUTE ?? DEFAULT_DELAY_MS_PER_MINUTE);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("AUTOMATION_DELAY_MS_PER_MINUTE integration phải là số nguyên dương.");
  }
  return value;
}
