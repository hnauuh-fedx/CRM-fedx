import { UnrecoverableError } from "bullmq";

import { prisma } from "../../database/prisma";
import { getAuthUser } from "../auth/auth.service";
import { assignVisibleLead, changeVisibleLeadStage, leadUpdatePermissions } from "../leads/lead-owner-stage-mutations.service";
import { createReminder } from "../leads/sale-overview.service";
import { resolveAutomationAssignee } from "./automation-assignment.service";
import { evaluateAutomationConditions } from "./automation-condition-evaluator";
import { getAutomationLeadData, getAutomationTemplateReferences, renderAutomationTemplate } from "./automation-data-field.service";
import type { AutomationActionResult, AutomationContext } from "./automation-execution.types";
import type { AutomationNode } from "./automation.types";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type AutomationActionExecutor = (node: AutomationNode, context: AutomationContext, nodeExecutionId: string) => Promise<AutomationActionResult>;

const executors = {
  condition: executeConditionAction,
  action_notification: executeNotificationAction,
  action_assign: executeAssignAction,
  action_assign_pool: executeAssignPoolAction,
  action_update_stage: executeUpdateStageAction,
  action_activity: executeActivityAction,
  action_reminder: executeReminderAction,
  delay: executeDelayAction,
} satisfies Record<Exclude<AutomationNode["type"], "trigger">, AutomationActionExecutor>;

export const REGISTERED_AUTOMATION_EXECUTOR_TYPES = Object.freeze(Object.keys(executors));

export async function executeRegisteredAutomationNode(
  node: AutomationNode,
  context: AutomationContext,
  nodeExecutionId: string,
): Promise<AutomationActionResult> {
  if (node.type === "trigger") throw new UnrecoverableError("Node khởi động không được thực thi như một action.");
  const executor: AutomationActionExecutor | undefined = executors[node.type];
  if (!executor) throw new UnrecoverableError(`Loại node không được hỗ trợ: ${String(node.type)}`);
  return executor(node, context, nodeExecutionId);
}

async function executeConditionAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string) {
  const result = { nextSourceHandle: await evaluateCondition(node, context) ? "default" : "false", delayMinutes: 0 };
  await markActionCompleted(prisma, nodeExecutionId, result);
  return result;
}

async function executeDelayAction(node: AutomationNode, _context: AutomationContext, nodeExecutionId: string) {
  const result = { nextSourceHandle: "default", delayMinutes: Number(node.data.delayMinutes ?? 0) };
  await markActionCompleted(prisma, nodeExecutionId, result);
  return result;
}

async function evaluateCondition(node: AutomationNode, context: AutomationContext): Promise<boolean> {
  const conditions = node.data.conditions ?? (node.data.field && node.data.operator
    ? [{ field: node.data.field, operator: node.data.operator, value: node.data.value }]
    : []);
  if (conditions.length === 0 || !context.leadId) throw new UnrecoverableError("Node điều kiện thiếu tiêu chí hoặc lead context.");
  const actor = await requireActor(context);
  const leadData = await getAutomationLeadData(actor, context.leadId, context.institutionProgramId, conditions.map((condition) => condition.field));
  if (!leadData) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  try {
    return evaluateAutomationConditions(leadData, node.data.conditionCombinator ?? "AND", conditions);
  } catch (error) {
    throw new UnrecoverableError(toErrorMessage(error));
  }
}

async function executeNotificationAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { title, content, targetRole } = node.data;
  if (!title || !content || !targetRole) throw new UnrecoverableError("Node thông báo thiếu tiêu đề, nội dung hoặc vai trò nhận.");
  const actor = await requireActor(context);
  const templateReferences = getAutomationTemplateReferences(title, content);
  const leadData = context.leadId && templateReferences.length > 0
    ? await getAutomationLeadData(actor, context.leadId, context.institutionProgramId, templateReferences)
    : new Map<string, unknown>();
  if (!leadData) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  const renderedTitle = renderAutomationTemplate(title, leadData);
  const renderedContent = renderAutomationTemplate(content, leadData);
  const scopeWhere = actor.accessScope === "ALL" ? {}
    : actor.accessScope === "DEPARTMENT" && actor.departmentIds.length > 0
      ? { user_departments: { some: { department_id: { in: actor.departmentIds } } } }
      : { id: actor.id };
  const users = await prisma.users.findMany({
    where: { status: "active", deleted_at: null, user_roles: { some: { roles: { code: targetRole } } }, ...scopeWhere },
    select: { id: true },
  });
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  await prisma.$transaction(async (tx) => {
    if (users.length > 0) await tx.notifications.createMany({ data: users.map((user) => ({ user_id: user.id, title: renderedTitle, content: renderedContent, type: "system" })) });
    await markActionCompleted(tx, nodeExecutionId, result);
  });
  return result;
}

async function executeAssignAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { assignToUserId } = node.data;
  if (!assignToUserId || !context.leadId) throw new UnrecoverableError("Node phân công thiếu nhân viên hoặc lead context.");
  const actor = await requireActor(context);
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const mutation = await assignVisibleLead(actor, context.leadId, { assigneeId: assignToUserId }, context.institutionProgramId, async (tx) => markActionCompleted(tx, nodeExecutionId, result));
  if (!mutation.ok) throw new UnrecoverableError(`Không thể phân công lead: ${mutation.reason}`);
  return result;
}

async function executeAssignPoolAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { assignmentStrategy, assigneeIds, departmentId } = node.data;
  if (!context.leadId || !assignmentStrategy || (!assigneeIds?.length && !departmentId)) throw new UnrecoverableError("Node chia Lead thiếu chiến lược, team/danh sách nhân viên hoặc lead context.");
  const actor = await requireActor(context);
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const mutation = await assignVisibleLead(actor, context.leadId, {
    departmentId,
    resolveAssigneeId: (tx) => resolveAutomationAssignee(tx, {
      ruleId: context.ruleId,
      nodeId: node.id,
      candidateIds: assigneeIds ?? [],
      departmentId,
      strategy: assignmentStrategy,
    }),
  }, context.institutionProgramId, async (tx) => markActionCompleted(tx, nodeExecutionId, result));
  if (!mutation.ok) throw new UnrecoverableError(`Không thể chia Lead tự động: ${mutation.reason}`);
  return result;
}

async function executeUpdateStageAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { stageId } = node.data;
  if (!stageId || !context.leadId) throw new UnrecoverableError("Node cập nhật pipeline thiếu giai đoạn hoặc lead context.");
  const actor = await requireActor(context);
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const mutation = await changeVisibleLeadStage(actor, context.leadId, stageId, context.institutionProgramId, async (tx) => markActionCompleted(tx, nodeExecutionId, result));
  if (!mutation.ok) throw new UnrecoverableError(`Không thể đổi giai đoạn lead: ${mutation.reason}`);
  return result;
}

async function executeActivityAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { activityType, activityContent } = node.data;
  if (!activityType || !activityContent || !context.leadId) throw new UnrecoverableError("Node hoạt động thiếu loại, nội dung hoặc lead context.");
  const actor = await requireActor(context);
  const canWriteActivity = actor.permissions.includes("lead_activity.create") || leadUpdatePermissions.some((permission) => actor.permissions.includes(permission));
  if (!canWriteActivity) throw new UnrecoverableError("Tài khoản kích hoạt không có quyền ghi hoạt động lead.");
  const templateReferences = getAutomationTemplateReferences(activityContent);
  const leadData = templateReferences.length > 0
    ? await getAutomationLeadData(actor, context.leadId, context.institutionProgramId, templateReferences)
    : new Map<string, unknown>();
  if (!leadData) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  const renderedContent = renderAutomationTemplate(activityContent, leadData);
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.lead_activities.create({ data: { lead_id: context.leadId, user_id: actor.id, type: activityType, content: renderedContent } });
    await tx.audit_logs.create({
      data: { user_id: actor.id, entity_type: "lead", entity_id: context.leadId, action: "automation_activity_created", new_data: { ruleId: context.ruleId, activityType } },
    });
    await markActionCompleted(tx, nodeExecutionId, result);
  });
  return result;
}

async function executeReminderAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { reminderTitle, reminderContent, reminderDelayMinutes } = node.data;
  if (!context.leadId || !reminderTitle || !Number.isFinite(Number(reminderDelayMinutes)) || Number(reminderDelayMinutes) <= 0) {
    throw new UnrecoverableError("Node nhắc việc thiếu tiêu đề, thời gian hoặc lead context.");
  }
  const actor = await requireActor(context);
  if (!actor.permissions.includes("reminder.create")) throw new UnrecoverableError("Tài khoản kích hoạt không có quyền tạo nhắc việc.");
  const references = getAutomationTemplateReferences(reminderTitle, reminderContent ?? "");
  const leadData = references.length > 0
    ? await getAutomationLeadData(actor, context.leadId, context.institutionProgramId, references)
    : new Map<string, unknown>();
  if (!leadData) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const reminder = await createReminder(actor, {
    leadId: context.leadId,
    title: renderAutomationTemplate(reminderTitle, leadData),
    content: reminderContent ? renderAutomationTemplate(reminderContent, leadData) : undefined,
    remindAt: new Date(Date.now() + Number(reminderDelayMinutes) * 60_000).toISOString(),
    customFieldValues: [],
  }, context.institutionProgramId, undefined, async (tx) => markActionCompleted(tx, nodeExecutionId, result));
  if (!reminder.ok) throw new UnrecoverableError(`Không thể tạo nhắc việc: ${reminder.reason}`);
  return result;
}

async function markActionCompleted(tx: TransactionClient | typeof prisma, nodeExecutionId: string, result: AutomationActionResult) {
  await tx.automation_node_executions.update({
    where: { id: nodeExecutionId },
    data: { status: "action_completed", next_source_handle: result.nextSourceHandle, delay_minutes: result.delayMinutes, action_completed_at: new Date(), error_message: null },
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
