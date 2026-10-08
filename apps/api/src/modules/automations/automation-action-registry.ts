import { UnrecoverableError } from "bullmq";

import { prisma } from "../../database/prisma";
import { getAuthUser } from "../auth/auth.service";
import { assignVisibleLead, changeVisibleLeadStage, leadUpdatePermissions } from "../leads/lead-owner-stage-mutations.service";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { createReminder } from "../leads/sale-overview.service";
import { uploadAdmissionDocument } from "../admissions/admission-document-management.service";
import {
  approveAdmissionProfile,
  changeAdmissionStatus,
  convertAdmissionToStudent,
  createAdmissionProfile,
} from "../admissions/admission-profile-management.service";
import { resolveAutomationAssignee } from "./automation-assignment.service";
import { createReassignmentMonitor } from "./automation-reassignment.service";
import { evaluateAutomationConditions } from "./automation-condition-evaluator";
import { getAutomationLeadData, getAutomationTemplateReferences, renderAutomationTemplate } from "./automation-data-field.service";
import { sendAutomationMessage } from "./automation-message-delivery.service";
import { callAutomationWebhook } from "./automation-webhook.service";
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
  action_message: executeMessageAction,
  action_webhook: executeWebhookAction,
  action_create_admission: executeCreateAdmissionAction,
  action_request_document: executeRequestDocumentAction,
  action_update_admission_status: executeUpdateAdmissionStatusAction,
  action_convert_student: executeConvertStudentAction,
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
  const { assignmentStrategy, assigneeIds, departmentId, reassignmentPolicy } = node.data;
  if (!context.leadId || !assignmentStrategy || (!assigneeIds?.length && !departmentId)) throw new UnrecoverableError("Node chia Lead thiếu chiến lược, team/danh sách nhân viên hoặc lead context.");
  const actor = await requireActor(context);
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  let monitorId: string | null = null;
  const mutation = await assignVisibleLead(actor, context.leadId, {
    departmentId,
    resolveAssigneeId: (tx) => resolveAutomationAssignee(tx, {
      ruleId: context.ruleId,
      nodeId: node.id,
      candidateIds: assigneeIds ?? [],
      departmentId,
      institutionProgramId: context.institutionProgramId,
      allowedDepartmentIds: actor.departmentIds,
      allowAllCandidates: actor.accessScope === "ALL" && actor.permissions.includes("lead.view_all"),
      strategy: assignmentStrategy,
    }),
  }, context.institutionProgramId, async (tx, assignment) => {
    await markActionCompleted(tx, nodeExecutionId, result);
    if (reassignmentPolicy?.enabled) {
      const monitor = await createReassignmentMonitor(tx, {
        ruleId: context.ruleId,
        nodeId: node.id,
        assignment,
        leadId: context.leadId!,
        actorId: actor.id,
        institutionProgramId: context.institutionProgramId,
        nodeSnapshot: {
          assignmentStrategy,
          assigneeIds: assigneeIds ?? [],
          ...(departmentId ? { departmentId } : {}),
        },
        policy: reassignmentPolicy,
      });
      monitorId = monitor.id;
    }
  });
  if (!mutation.ok) throw new UnrecoverableError(`Không thể chia Lead tự động: ${mutation.reason}`);
  if (monitorId) {
    const { enqueueReassignmentMonitorJobs } = await import("./automation-reassignment-queue.service.js");
    await enqueueReassignmentMonitorJobs(monitorId).catch((error) => {
      console.error("Không thể enqueue monitor chuyển Sale; recovery scan sẽ thử lại.", { monitorId, error });
    });
  }
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

async function executeMessageAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { messageChannel, messageSubject, messageContent, consentPolicy } = node.data;
  if (!context.leadId || !messageChannel || !messageContent || !consentPolicy) {
    throw new UnrecoverableError("Node gửi đa kênh thiếu kênh, nội dung, consent policy hoặc lead context.");
  }
  const actor = await requireActor(context);
  await sendAutomationMessage({
    actor,
    leadId: context.leadId,
    institutionProgramId: context.institutionProgramId,
    nodeExecutionId,
    channel: messageChannel,
    subject: messageSubject,
    content: messageContent,
    consentPolicy,
  });
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  await markActionCompleted(prisma, nodeExecutionId, result);
  return result;
}

async function executeWebhookAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { webhookEndpointId, webhookPayload } = node.data;
  if (!webhookEndpointId || !webhookPayload) throw new UnrecoverableError("Node webhook thiếu endpoint hoặc payload.");
  const actor = await requireActor(context);
  await callAutomationWebhook({
    actor,
    leadId: context.leadId,
    institutionProgramId: context.institutionProgramId,
    nodeExecutionId,
    endpointId: webhookEndpointId,
    payloadTemplate: webhookPayload,
  });
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  await markActionCompleted(prisma, nodeExecutionId, result);
  return result;
}

async function executeCreateAdmissionAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { admissionMajorId, admissionStatusId } = node.data;
  if (!context.leadId || !context.institutionProgramId || !admissionMajorId || !admissionStatusId) {
    throw new UnrecoverableError("Node tạo hồ sơ thiếu Lead, chương trình, ngành hoặc trạng thái ban đầu.");
  }
  const actor = await requireActorWithPermission(context, "admission.update", "Tài khoản kích hoạt không có quyền tạo hồ sơ tuyển sinh.");
  if (!(await isLeadInActorScope(context, actor))) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  const initialStatus = await prisma.admission_statuses.findUnique({ where: { id: admissionStatusId }, select: { code: true } });
  if (!initialStatus) throw new UnrecoverableError("Trạng thái hồ sơ ban đầu không còn tồn tại.");
  if (initialStatus.code === "APPROVED" || initialStatus.code === "ENROLLED") {
    throw new UnrecoverableError("Không thể tạo hồ sơ trực tiếp ở trạng thái đã duyệt hoặc đã nhập học.");
  }
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const mutation = await createAdmissionProfile(actor, {
    leadId: context.leadId,
    institutionProgramId: context.institutionProgramId,
    majorId: admissionMajorId,
    admissionStatusId,
  }, undefined, context.institutionProgramId, {
    causationRuleIds: extendCausation(context),
    afterMutation: (tx) => markActionCompleted(tx, nodeExecutionId, result),
  });
  if (!mutation.ok) throw new UnrecoverableError(`Không thể tạo hồ sơ tuyển sinh: ${mutation.reason}`);
  return result;
}

async function executeRequestDocumentAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { admissionDocumentType } = node.data;
  if (!context.leadId || !admissionDocumentType) throw new UnrecoverableError("Node yêu cầu tài liệu thiếu loại tài liệu hoặc Lead context.");
  const actor = await requireActorWithPermission(context, "admission_document.upload", "Tài khoản kích hoạt không có quyền yêu cầu tài liệu hồ sơ.");
  if (!(await isLeadInActorScope(context, actor))) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const mutation = await uploadAdmissionDocument(actor, {
    leadId: context.leadId,
    documentType: admissionDocumentType,
  }, undefined, context.institutionProgramId, {
    causationRuleIds: extendCausation(context),
    afterMutation: (tx) => markActionCompleted(tx, nodeExecutionId, result),
  });
  if (!mutation.ok) throw new UnrecoverableError(`Không thể yêu cầu tài liệu hồ sơ: ${mutation.reason}`);
  return result;
}

async function executeUpdateAdmissionStatusAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const { admissionStatusId } = node.data;
  if (!admissionStatusId) throw new UnrecoverableError("Node cập nhật hồ sơ chưa chọn trạng thái.");
  const actor = await requireActor(context);
  const profileId = await resolveAdmissionProfileId(context, actor);
  if (!profileId) throw new UnrecoverableError("Không tìm thấy hồ sơ tuyển sinh trong context của automation.");
  const targetStatus = await prisma.admission_statuses.findUnique({ where: { id: admissionStatusId }, select: { code: true } });
  if (!targetStatus) throw new UnrecoverableError("Trạng thái hồ sơ không còn tồn tại.");
  if (targetStatus.code === "ENROLLED") {
    throw new UnrecoverableError("Không thể chuyển trạng thái trực tiếp sang đã nhập học; hãy dùng bước chuyển thành sinh viên.");
  }
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const mutationOptions = {
    causationRuleIds: extendCausation(context),
    afterMutation: (tx: TransactionClient) => markActionCompleted(tx, nodeExecutionId, result),
  };
  const mutation = targetStatus.code === "APPROVED"
    ? actor.permissions.includes("admission.approve")
      ? await approveAdmissionProfile(actor, profileId, admissionStatusId, undefined, context.institutionProgramId, mutationOptions)
      : { ok: false as const, reason: "approval_permission_required" as const }
    : actor.permissions.includes("admission_status.update") || actor.permissions.includes("admission.update")
      ? await changeAdmissionStatus(actor, profileId, admissionStatusId, undefined, context.institutionProgramId, mutationOptions)
      : { ok: false as const, reason: "status_permission_required" as const };
  if (!mutation.ok) throw new UnrecoverableError(`Không thể cập nhật trạng thái hồ sơ: ${mutation.reason}`);
  return result;
}

async function executeConvertStudentAction(node: AutomationNode, context: AutomationContext, nodeExecutionId: string): Promise<AutomationActionResult> {
  const actor = await requireActorWithPermission(context, "student.create_from_admission", "Tài khoản kích hoạt không có quyền chuyển hồ sơ thành sinh viên.");
  const profileId = await resolveAdmissionProfileId(context, actor);
  if (!profileId) throw new UnrecoverableError("Không tìm thấy hồ sơ tuyển sinh trong context của automation.");
  const result = { nextSourceHandle: "default", delayMinutes: 0 };
  const mutation = await convertAdmissionToStudent(actor, profileId, { classId: node.data.admissionClassId }, undefined, context.institutionProgramId, {
    causationRuleIds: extendCausation(context),
    afterMutation: (tx) => markActionCompleted(tx, nodeExecutionId, result),
  });
  if (!mutation.ok) throw new UnrecoverableError(`Không thể chuyển hồ sơ thành sinh viên: ${mutation.reason}`);
  return result;
}

async function resolveAdmissionProfileId(context: AutomationContext, actor: Awaited<ReturnType<typeof requireActor>>) {
  if (!context.admissionProfileId && !context.leadId) return null;
  const profile = await prisma.admission_profiles.findFirst({
    where: {
      ...(context.admissionProfileId ? { id: context.admissionProfileId } : { lead_id: context.leadId }),
      ...(context.institutionProgramId ? { institution_program_id: context.institutionProgramId } : {}),
      leads: { is: { deleted_at: null, ...getLeadScopeWhere(actor, context.institutionProgramId) } },
    },
    select: { id: true },
  });
  return profile?.id ?? null;
}

async function isLeadInActorScope(context: AutomationContext, actor: Awaited<ReturnType<typeof requireActor>>) {
  if (!context.leadId) return false;
  const lead = await prisma.leads.findFirst({
    where: {
      id: context.leadId,
      deleted_at: null,
      ...getLeadScopeWhere(actor, context.institutionProgramId),
      ...(context.institutionProgramId ? { institution_program_id: context.institutionProgramId } : {}),
    },
    select: { id: true },
  });
  return Boolean(lead);
}

export function extendCausation(context: Pick<AutomationContext, "causationRuleIds" | "ruleId">) {
  return [...new Set([...(context.causationRuleIds ?? []), context.ruleId])].slice(-20);
}

async function markActionCompleted(tx: TransactionClient | typeof prisma, nodeExecutionId: string, result: AutomationActionResult) {
  await tx.automation_node_executions.update({
    where: { id: nodeExecutionId },
    data: { status: "action_completed", next_source_handle: result.nextSourceHandle, delay_minutes: result.delayMinutes, action_completed_at: new Date(), error_message: null },
  });
}

async function requireActor(context: AutomationContext) {
  if (!context.actorId) throw new UnrecoverableError("Automation context không có tài khoản kích hoạt.");
  const actor = await getAuthUser(context.actorId, context.institutionProgramId);
  if (!actor) throw new UnrecoverableError("Tài khoản kích hoạt automation không còn hoạt động.");
  return actor;
}

async function requireActorWithPermission(context: AutomationContext, permission: string, message: string) {
  const actor = await requireActor(context);
  if (!actor.permissions.includes(permission)) throw new UnrecoverableError(message);
  return actor;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
