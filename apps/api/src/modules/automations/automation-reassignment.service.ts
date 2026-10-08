import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AutomationReassignmentPolicy } from "@admission-crm/shared/automation-reassignment-policy";
import { getAuthUser } from "../auth/auth.service";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { assignVisibleLead, type LeadAssignmentTransactionContext } from "../leads/lead-owner-stage-mutations.service";
import {
  listEligibleAutomationAssigneeIds,
  resolveAutomationAssignee,
  type AutomationAssignmentStrategy,
} from "./automation-assignment.service";
import { getAutomationLeadData, getAutomationTemplateReferences, renderAutomationTemplate } from "./automation-data-field.service";
import { buildReassignmentSchedule, planReassignmentCandidates, type ReassignmentStopReason } from "./automation-reassignment-state";

type TransactionClient = Prisma.TransactionClient;

export type ReassignmentNodeSnapshot = {
  assignmentStrategy: AutomationAssignmentStrategy;
  assigneeIds: string[];
  departmentId?: string;
};

type CreateMonitorInput = {
  ruleId: string;
  nodeId: string;
  assignment: LeadAssignmentTransactionContext;
  leadId: string;
  actorId: string;
  institutionProgramId?: string;
  nodeSnapshot: ReassignmentNodeSnapshot;
  policy: AutomationReassignmentPolicy;
  reassignmentCount?: number;
  poolCycle?: number;
  attemptedAssigneeIds?: string[];
};

class ReassignmentStoppedError extends Error {
  constructor(readonly reason: ReassignmentStopReason | "assignment_no_longer_eligible") {
    super(reason);
  }
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parsePolicy(value: Prisma.JsonValue): AutomationReassignmentPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const policy = value as Record<string, unknown>;
  if (
    policy.enabled !== true
    || policy.interactionCriterion !== "not_opened_since_assignment"
    || typeof policy.timeoutMinutes !== "number"
    || typeof policy.assignToAnotherSale !== "boolean"
    || policy.excludeCurrentAssignee !== true
    || typeof policy.maxReassignments !== "number"
    || typeof policy.recyclePool !== "boolean"
    || typeof policy.maxPoolCycles !== "number"
    || typeof policy.warningEnabled !== "boolean"
    || typeof policy.warningBeforeMinutes !== "number"
    || typeof policy.warningContent !== "string"
    || typeof policy.notifyOnRemoval !== "boolean"
  ) return null;
  return policy as AutomationReassignmentPolicy;
}

function parseNodeSnapshot(value: Prisma.JsonValue): ReassignmentNodeSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const node = value as Record<string, unknown>;
  if (
    !["least_loaded", "round_robin"].includes(String(node.assignmentStrategy))
    || !Array.isArray(node.assigneeIds)
    || !node.assigneeIds.every((id) => typeof id === "string")
    || (node.departmentId !== undefined && typeof node.departmentId !== "string")
  ) return null;
  return {
    assignmentStrategy: node.assignmentStrategy as AutomationAssignmentStrategy,
    assigneeIds: node.assigneeIds as string[],
    ...(typeof node.departmentId === "string" ? { departmentId: node.departmentId } : {}),
  };
}

export async function createReassignmentMonitor(tx: TransactionClient, input: CreateMonitorInput) {
  const schedule = buildReassignmentSchedule(input.assignment.assignedAt, input.policy);
  return tx.automation_reassignment_monitors.upsert({
    where: {
      rule_id_node_id_assignment_id: {
        rule_id: input.ruleId,
        node_id: input.nodeId,
        assignment_id: input.assignment.assignmentId,
      },
    },
    create: {
      rule_id: input.ruleId,
      node_id: input.nodeId,
      assignment_id: input.assignment.assignmentId,
      lead_id: input.leadId,
      assignee_id: input.assignment.assigneeId,
      actor_id: input.actorId,
      institution_program_id: input.institutionProgramId,
      warning_due_at: schedule.warningDueAt,
      reassignment_due_at: schedule.reassignmentDueAt,
      reassignment_count: input.reassignmentCount ?? 0,
      pool_cycle: input.poolCycle ?? 0,
      attempted_assignee_ids: asJson(input.attemptedAssigneeIds ?? [input.assignment.assigneeId]),
      node_snapshot: asJson(input.nodeSnapshot),
      policy_snapshot: asJson(input.policy),
    },
    update: {},
    select: { id: true },
  });
}

async function lockMonitor(tx: TransactionClient, monitorId: string) {
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${`reassignment-monitor:${monitorId}`}))
  `);
}

export async function processReassignmentWarning(monitorId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await lockMonitor(tx, monitorId);
    const monitor = await tx.automation_reassignment_monitors.findUnique({ where: { id: monitorId } });
    if (!monitor || !["pending", "warned"].includes(monitor.status)) return { ok: true as const, outcome: "inactive" as const };
    if (!monitor.warning_due_at || monitor.warning_due_at > now || monitor.warned_at) return { ok: true as const, outcome: "not_due" as const };
    if (monitor.reassignment_due_at <= now) return { ok: true as const, outcome: "expiry_due" as const };
    const assignment = await tx.lead_assignments.findUnique({
      where: { id: monitor.assignment_id },
      select: { is_main_owner: true, assigned_to: true, first_opened_at: true },
    });
    if (!assignment || !assignment.is_main_owner || assignment.assigned_to !== monitor.assignee_id) {
      await tx.automation_reassignment_monitors.update({
        where: { id: monitor.id },
        data: { status: "cancelled", completion_reason: "stale_assignment", processed_at: now, updated_at: now },
      });
      return { ok: true as const, outcome: "cancelled" as const };
    }
    if (assignment.first_opened_at) {
      await tx.automation_reassignment_monitors.update({
        where: { id: monitor.id },
        data: { status: "completed", completion_reason: "lead_opened", processed_at: now, updated_at: now },
      });
      return { ok: true as const, outcome: "opened" as const };
    }
    const policy = parsePolicy(monitor.policy_snapshot);
    if (!policy?.warningEnabled) return { ok: true as const, outcome: "warning_disabled" as const };
    const actor = monitor.actor_id ? await getAuthUser(monitor.actor_id, monitor.institution_program_id ?? undefined) : null;
    if (!actor || !actor.permissions.some((permission) => permission === "lead.assign" || permission === "lead.reassign")) {
      throw new Error("Tài khoản chạy cảnh báo chuyển Sale không còn quyền phân công Lead.");
    }
    const visibleLead = await tx.leads.findFirst({
      where: {
        id: monitor.lead_id,
        deleted_at: null,
        ...getLeadScopeWhere(actor, monitor.institution_program_id ?? undefined),
        ...(monitor.institution_program_id ? { institution_program_id: monitor.institution_program_id } : {}),
      },
      select: { id: true },
    });
    if (!visibleLead) throw new Error("Lead cảnh báo không còn nằm trong phạm vi của tài khoản automation.");
    const references = getAutomationTemplateReferences(policy.warningContent);
    const leadData = references.length > 0
      ? await getAutomationLeadData(actor, monitor.lead_id, monitor.institution_program_id ?? undefined, references)
      : new Map<string, unknown>();
    if (!leadData) throw new Error("Không thể đọc dữ liệu Lead để render cảnh báo.");
    await tx.notifications.create({
      data: {
        user_id: monitor.assignee_id,
        title: "Lead sắp được chuyển cho nhân viên khác",
        content: renderAutomationTemplate(policy.warningContent, leadData),
        type: "automation_reassignment_warning",
      },
    });
    await tx.automation_reassignment_monitors.update({
      where: { id: monitor.id },
      data: { status: "warned", warned_at: now, updated_at: now },
    });
    return { ok: true as const, outcome: "warned" as const };
  });
}

async function completeStoppedMonitor(monitorId: string, reason: string, now: Date) {
  await prisma.automation_reassignment_monitors.updateMany({
    where: { id: monitorId, status: "processing" },
    data: { status: reason === "assignment_no_longer_eligible" ? "cancelled" : "completed", completion_reason: reason, processed_at: now, updated_at: now },
  });
}

export async function processReassignmentExpiry(monitorId: string, now = new Date()) {
  const claimed = await prisma.$transaction(async (tx) => {
    await lockMonitor(tx, monitorId);
    const monitor = await tx.automation_reassignment_monitors.findUnique({ where: { id: monitorId } });
    if (!monitor || !["pending", "warned"].includes(monitor.status)) return null;
    if (monitor.reassignment_due_at > now) return null;
    const assignment = await tx.lead_assignments.findUnique({
      where: { id: monitor.assignment_id },
      select: { is_main_owner: true, assigned_to: true, first_opened_at: true },
    });
    if (!assignment || !assignment.is_main_owner || assignment.assigned_to !== monitor.assignee_id) {
      await tx.automation_reassignment_monitors.update({
        where: { id: monitor.id },
        data: { status: "cancelled", completion_reason: "stale_assignment", processed_at: now, updated_at: now },
      });
      return null;
    }
    if (assignment.first_opened_at) {
      await tx.automation_reassignment_monitors.update({
        where: { id: monitor.id },
        data: { status: "completed", completion_reason: "lead_opened", processed_at: now, updated_at: now },
      });
      return null;
    }
    const policy = parsePolicy(monitor.policy_snapshot);
    if (!policy || !policy.assignToAnotherSale) {
      await tx.automation_reassignment_monitors.update({
        where: { id: monitor.id },
        data: { status: "completed", completion_reason: policy ? "reassignment_disabled" : "invalid_policy", processed_at: now, updated_at: now },
      });
      return null;
    }
    if (monitor.reassignment_count >= policy.maxReassignments) {
      await tx.automation_reassignment_monitors.update({
        where: { id: monitor.id },
        data: { status: "completed", completion_reason: "max_reassignments_reached", processed_at: now, updated_at: now },
      });
      return null;
    }
    await tx.automation_reassignment_monitors.update({
      where: { id: monitor.id },
      data: { status: "processing", claimed_at: now, last_error: null, updated_at: now },
    });
    return { ...monitor, policy };
  });
  if (!claimed) return { ok: true as const, outcome: "inactive" as const };

  const nodeSnapshot = parseNodeSnapshot(claimed.node_snapshot);
  const actor = claimed.actor_id ? await getAuthUser(claimed.actor_id, claimed.institution_program_id ?? undefined) : null;
  if (!nodeSnapshot || !actor) {
    await prisma.automation_reassignment_monitors.updateMany({
      where: { id: monitorId, status: "processing" },
      data: { status: "failed", completion_reason: nodeSnapshot ? "actor_unavailable" : "invalid_node_snapshot", processed_at: now, updated_at: now },
    });
    return { ok: false as const, outcome: "invalid_context" as const };
  }

  let successorMonitorId: string | null = null;
  let candidatePlan: ReturnType<typeof planReassignmentCandidates> | null = null;
  try {
    const mutation = await assignVisibleLead(actor, claimed.lead_id, {
      departmentId: nodeSnapshot.departmentId,
      resolveAssigneeId: async (tx) => {
        const assignment = await tx.lead_assignments.findUnique({
          where: { id: claimed.assignment_id },
          select: { is_main_owner: true, assigned_to: true, first_opened_at: true },
        });
        if (!assignment || !assignment.is_main_owner || assignment.assigned_to !== claimed.assignee_id || assignment.first_opened_at) {
          throw new ReassignmentStoppedError("assignment_no_longer_eligible");
        }
        const eligibleIds = await listEligibleAutomationAssigneeIds(tx, {
          candidateIds: nodeSnapshot.assigneeIds,
          departmentId: nodeSnapshot.departmentId,
          institutionProgramId: claimed.institution_program_id ?? undefined,
          allowedDepartmentIds: actor.departmentIds,
          allowAllCandidates: actor.accessScope === "ALL" && actor.permissions.includes("lead.view_all"),
        });
        candidatePlan = planReassignmentCandidates({
          eligibleIds,
          currentAssigneeId: claimed.assignee_id,
          attemptedAssigneeIds: parseStringArray(claimed.attempted_assignee_ids),
          recyclePool: claimed.policy.recyclePool,
          poolCycle: claimed.pool_cycle,
          maxPoolCycles: claimed.policy.maxPoolCycles,
        });
        if ("stopReason" in candidatePlan) throw new ReassignmentStoppedError(candidatePlan.stopReason!);
        return resolveAutomationAssignee(tx, {
          ruleId: claimed.rule_id,
          nodeId: claimed.node_id,
          candidateIds: candidatePlan.candidateIds,
          departmentId: nodeSnapshot.departmentId,
          institutionProgramId: claimed.institution_program_id ?? undefined,
          strategy: nodeSnapshot.assignmentStrategy,
        });
      },
    }, claimed.institution_program_id ?? undefined, async (tx, assignment) => {
      if (!candidatePlan || "stopReason" in candidatePlan) throw new Error("Thiếu kế hoạch chọn nhân viên thay thế.");
      const reassignmentCount = claimed.reassignment_count + 1;
      const attemptedAssigneeIds = [...new Set([...candidatePlan.attemptedAssigneeIds, assignment.assigneeId])];
      await tx.automation_reassignment_monitors.update({
        where: { id: claimed.id },
        data: {
          status: "reassigned",
          next_assignment_id: assignment.assignmentId,
          completion_reason: "sale_reassigned",
          processed_at: now,
          updated_at: now,
        },
      });
      await tx.lead_activities.create({
        data: {
          lead_id: claimed.lead_id,
          user_id: actor.id,
          type: "automation_reassignment",
          content: "Tự động chuyển Lead do Sale không mở bản ghi trong thời hạn cấu hình.",
        },
      });
      await tx.audit_logs.create({
        data: {
          user_id: actor.id,
          entity_type: "automation_reassignment_monitor",
          entity_id: claimed.id,
          action: "sale_reassigned",
          ip_address: null,
          old_data: { assignmentId: claimed.assignment_id, assigneeId: claimed.assignee_id },
          new_data: {
            ruleId: claimed.rule_id,
            nodeId: claimed.node_id,
            assignmentId: assignment.assignmentId,
            assigneeId: assignment.assigneeId,
            reassignmentCount,
            poolCycle: candidatePlan.poolCycle,
          },
        },
      });
      if (claimed.policy.notifyOnRemoval) {
        await tx.notifications.create({
          data: {
            user_id: claimed.assignee_id,
            title: "Lead đã được chuyển cho nhân viên khác",
            content: "Lead đã được thu hồi do bạn chưa mở bản ghi trong thời hạn cấu hình.",
            type: "automation_reassignment_removed",
          },
        });
      }
      if (reassignmentCount < claimed.policy.maxReassignments) {
        const successor = await createReassignmentMonitor(tx, {
          ruleId: claimed.rule_id,
          nodeId: claimed.node_id,
          assignment,
          leadId: claimed.lead_id,
          actorId: actor.id,
          institutionProgramId: claimed.institution_program_id ?? undefined,
          nodeSnapshot,
          policy: claimed.policy,
          reassignmentCount,
          poolCycle: candidatePlan.poolCycle,
          attemptedAssigneeIds,
        });
        successorMonitorId = successor.id;
      }
    });
    if (!mutation.ok) {
      await prisma.automation_reassignment_monitors.updateMany({
        where: { id: monitorId, status: "processing" },
        data: { status: "failed", completion_reason: mutation.reason, processed_at: now, updated_at: now },
      });
      return { ok: false as const, outcome: mutation.reason };
    }
  } catch (error) {
    if (error instanceof ReassignmentStoppedError) {
      await completeStoppedMonitor(monitorId, error.reason, now);
      return { ok: true as const, outcome: error.reason };
    }
    await prisma.automation_reassignment_monitors.updateMany({
      where: { id: monitorId, status: "processing" },
      data: { status: claimed.warned_at ? "warned" : "pending", claimed_at: null, last_error: error instanceof Error ? error.message : String(error), updated_at: new Date() },
    });
    throw error;
  }

  if (successorMonitorId) {
    const { enqueueReassignmentMonitorJobs } = await import("./automation-reassignment-queue.service.js");
    await enqueueReassignmentMonitorJobs(successorMonitorId);
  }
  return { ok: true as const, outcome: "reassigned" as const, successorMonitorId };
}
