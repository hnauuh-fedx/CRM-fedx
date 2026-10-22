import type { AutomationAssignmentResult } from "@admission-crm/shared/automation-assignment";
import { Prisma } from "../../generated/prisma/client";
import type { AutomationActionResult, AutomationContext } from "./automation-execution.types";
import type { AutomationNode } from "./automation.types";

type Tx = Prisma.TransactionClient;
const checkpointStatuses = new Set(["action_completed", "completed", "action_completed_no_change", "completed_no_change"]);

// Called only after the lead's assignment lock and visibility check.
export async function assignmentCheckpoint(tx: Tx, nodeExecutionId: string, result: AutomationActionResult) {
  const saved = await tx.automation_node_executions.findUniqueOrThrow({ where: { id: nodeExecutionId } });
  if (!checkpointStatuses.has(saved.status)) return false;
  result.noChange = saved.status.endsWith("_no_change");
  return true;
}

async function checkpoint(tx: Tx, nodeExecutionId: string, outcome: AutomationAssignmentResult, result: AutomationActionResult) {
  const ids = [outcome.currentAssigneeId, outcome.requestedAssigneeId].filter((id): id is string => Boolean(id));
  const names = await tx.users.findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true } });
  outcome.currentAssigneeName = names.find((user) => user.id === outcome.currentAssigneeId)?.full_name;
  outcome.requestedAssigneeName = names.find((user) => user.id === outcome.requestedAssigneeId)?.full_name;
  result.noChange = outcome.kind !== "assigned";
  await tx.automation_node_executions.update({
    where: { id: nodeExecutionId },
    data: {
      assignment_result: JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonValue,
      status: result.noChange ? "action_completed_no_change" : "action_completed",
      next_source_handle: result.nextSourceHandle, delay_minutes: result.delayMinutes,
      action_completed_at: new Date(), error_message: null,
    },
  });
}

async function audit(tx: Tx, context: AutomationContext, nodeId: string, nodeExecutionId: string, action: string, data: Record<string, unknown>) {
  await tx.audit_logs.create({ data: {
    user_id: context.actorId, entity_type: "lead", entity_id: context.leadId, action,
    new_data: { ...(context.manualUnassignmentEventId ? { eventId: context.manualUnassignmentEventId } : {}),
      ruleId: context.ruleId, nodeId, nodeExecutionId, ...data } as Prisma.InputJsonValue,
  } });
}

export async function completeAssignment(tx: Tx, context: AutomationContext, nodeId: string, nodeExecutionId: string, assignmentId: string, result: AutomationActionResult) {
  const assignment = await tx.lead_assignments.findUniqueOrThrow({ where: { id: assignmentId } });
  const execution = await tx.automation_node_executions.findUniqueOrThrow({ where: { id: nodeExecutionId }, select: {
    automation_execution_logs: { select: { id: true, automation_rules: { select: { name: true } }, automation_rule_versions: { select: { version: true } } } },
  } });
  const log = execution.automation_execution_logs;
  const outcome: AutomationAssignmentResult = {
    kind: "assigned", reason: "assigned", currentAssigneeId: assignment.assigned_to,
    requestedAssigneeId: assignment.assigned_to, candidateIds: [], departmentId: assignment.department_id, assignmentId,
    source: { ruleId: context.ruleId, ruleName: log.automation_rules.name, version: log.automation_rule_versions?.version ?? null, nodeId, executionId: log.id },
  };
  await audit(tx, context, nodeId, nodeExecutionId, "automation_assignment_completed", { assignmentId, source: outcome.source });
  await checkpoint(tx, nodeExecutionId, outcome, result);
}

export async function preserveAssignment(tx: Tx, context: AutomationContext, node: AutomationNode, nodeExecutionId: string, reason: string, assigneeId: string | null, result: AutomationActionResult) {
  const assignment = assigneeId ? await tx.lead_assignments.findFirst({
    where: { lead_id: context.leadId, assigned_to: assigneeId, is_main_owner: true },
    orderBy: [{ assigned_at: "desc" }, { id: "desc" }], select: { id: true },
  }) : null;
  // Restrict the indexed audit lookup to this lead and exact assignment, never scan all leads.
  const previous = assignment ? await tx.audit_logs.findFirst({
    where: { entity_type: "lead", entity_id: context.leadId, action: "automation_assignment_completed",
      new_data: { path: ["assignmentId"], equals: assignment.id } },
    orderBy: [{ created_at: "desc" }, { id: "desc" }], select: { new_data: true },
  }) : null;
  const source = (previous?.new_data as { source?: AutomationAssignmentResult["source"] } | null)?.source ?? null;
  const outcome: AutomationAssignmentResult = {
    kind: reason === "same_assignee" ? "unchanged" : reason === "stale_unassignment_event" ? "stale_event" : "conflict",
    reason, currentAssigneeId: assigneeId, requestedAssigneeId: node.data.assignToUserId ?? null,
    candidateIds: node.data.assigneeIds ?? [], departmentId: node.data.departmentId ?? null,
    assignmentId: assignment?.id ?? null, source,
  };
  await audit(tx, context, node.id, nodeExecutionId, "automation_assignment_skipped", { ...outcome });
  await checkpoint(tx, nodeExecutionId, outcome, result);
}
