import { prisma } from "../../database/prisma";
import { getAuthUser } from "../auth/auth.service";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import {
  canRetryAdmissionExpiryExecution,
  formatAdmissionExpiryDate,
  getAdmissionExpiryExecutionId,
  getAdmissionExpiryTargetDate,
} from "./automation-admission-expiry";
import { startAutomationExecution } from "./automation-engine.service";
import { startAutomationBulkRun } from "./automation.service";
import { findLatestDueScheduleMinute } from "./automation-schedule";
import type { AutomationGraphData } from "./automation.types";

export async function dispatchDueScheduledAutomations(now = new Date()) {
  let dispatched = 0;
  let cursor: string | undefined;
  do {
    const rules = await prisma.automation_rules.findMany({
      where: { is_active: true, archived_at: null, trigger_type: "scheduled" },
      select: { id: true, graph_data: true, created_by: true },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const rule of rules) dispatched += await dispatchScheduledRule(rule, now);
    cursor = rules.at(-1)?.id;
    if (rules.length < 500) break;
  } while (cursor);
  return dispatched;
}

export async function dispatchExpiringAdmissionAutomations(now = new Date()) {
  let dispatched = 0;
  let ruleCursor: string | undefined;
  do {
    const rules = await prisma.automation_rules.findMany({
      where: { is_active: true, archived_at: null, trigger_type: "admission_profile_expiring" },
      select: {
        id: true,
        version: true,
        trigger_type: true,
        graph_data: true,
        institution_program_id: true,
        created_by: true,
      },
      orderBy: { id: "asc" },
      take: 500,
      ...(ruleCursor ? { cursor: { id: ruleCursor }, skip: 1 } : {}),
    });
    for (const rule of rules) {
      const graph = rule.graph_data as AutomationGraphData;
      const leadDays = Number(graph.nodes.find((node) => node.type === "trigger")?.data.expiryLeadDays);
      if (!Number.isInteger(leadDays) || leadDays < 0 || !rule.created_by) continue;
      const actor = await getAuthUser(rule.created_by);
      if (!actor) continue;

      const targetDate = getAdmissionExpiryTargetDate(now, leadDays);
      const nextDate = new Date(targetDate.getTime() + 24 * 60 * 60_000);
      const leadScope = {
        deleted_at: null,
        ...getLeadScopeWhere(actor, rule.institution_program_id ?? undefined),
      };
      let cursor: string | undefined;
      do {
        const profiles = await prisma.admission_profiles.findMany({
          where: {
            expires_at: { gte: targetDate, lt: nextDate },
            lead_id: { not: null },
            leads: { is: leadScope },
            ...(rule.institution_program_id ? { institution_program_id: rule.institution_program_id } : {}),
          },
          select: { id: true, lead_id: true, institution_program_id: true },
          orderBy: { id: "asc" },
          take: 500,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const executionIds = profiles.map((profile) => getAdmissionExpiryExecutionId(rule.id, profile.id, targetDate));
        const existingExecutions = executionIds.length > 0
          ? await prisma.automation_execution_logs.findMany({
              where: { id: { in: executionIds } },
              select: { id: true, status: true, _count: { select: { automation_node_executions: true } } },
            })
          : [];
        const existingById = new Map(existingExecutions.map((execution) => [execution.id, execution]));

        for (const [index, profile] of profiles.entries()) {
          const executionId = executionIds[index];
          const existing = existingById.get(executionId);
          const canRetryEnqueueFailure = canRetryAdmissionExpiryExecution(existing ? {
            status: existing.status,
            nodeExecutionCount: existing._count.automation_node_executions,
          } : null);
          if (existing && !canRetryEnqueueFailure) continue;
          const result = await startAutomationExecution({
            id: rule.id,
            version: rule.version,
            triggerType: rule.trigger_type,
            graphData: graph,
            institutionProgramId: rule.institution_program_id,
            createdBy: rule.created_by,
          }, {
            actorId: rule.created_by,
            leadId: profile.lead_id ?? undefined,
            admissionProfileId: profile.id,
            institutionProgramId: profile.institution_program_id ?? undefined,
            payload: { expiresAt: formatAdmissionExpiryDate(targetDate), leadDays },
          }, "event", rule.created_by, undefined, executionId, canRetryEnqueueFailure);
          if (result.ok) dispatched += 1;
        }
        cursor = profiles.at(-1)?.id;
        if (profiles.length < 500) break;
      } while (cursor);
    }
    ruleCursor = rules.at(-1)?.id;
    if (rules.length < 500) break;
  } while (ruleCursor);
  return dispatched;
}

async function dispatchScheduledRule(
  rule: { id: string; graph_data: unknown; created_by: string | null },
  now: Date,
) {
  const graph = rule.graph_data as AutomationGraphData;
  const data = graph.nodes.find((node) => node.type === "trigger")?.data;
  if (!data?.scheduleTimezone || !data.scheduleTime || !data.scheduleDays?.length || !data.scheduleCustomerListId) return 0;
  const schedule = { timezone: data.scheduleTimezone, time: data.scheduleTime, days: data.scheduleDays, excludedDates: data.scheduleExcludedDates };
  const scheduledFor = findLatestDueScheduleMinute(now, schedule);
  if (!scheduledFor) return 0;

  let dispatch = await prisma.automation_schedule_dispatches.findUnique({
    where: { rule_id_scheduled_for: { rule_id: rule.id, scheduled_for: scheduledFor } },
    select: { id: true, status: true, updated_at: true },
  });
  if (!dispatch) {
    try {
      dispatch = await prisma.automation_schedule_dispatches.create({
        data: { rule_id: rule.id, scheduled_for: scheduledFor },
        select: { id: true, status: true, updated_at: true },
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) throw error;
      dispatch = await prisma.automation_schedule_dispatches.findUnique({
        where: { rule_id_scheduled_for: { rule_id: rule.id, scheduled_for: scheduledFor } },
        select: { id: true, status: true, updated_at: true },
      });
    }
  }
  if (!dispatch || dispatch.status === "dispatched") return 0;
  if (dispatch.status === "processing" && dispatch.updated_at.getTime() < now.getTime() - 5 * 60_000) {
    await prisma.automation_schedule_dispatches.updateMany({
      where: { id: dispatch.id, status: "processing", updated_at: dispatch.updated_at },
      data: { status: "failed", error_message: "Khôi phục lượt lịch bị gián đoạn.", updated_at: now },
    });
  }
  const claimed = await prisma.automation_schedule_dispatches.updateMany({
    where: { id: dispatch.id, status: { in: ["pending", "failed"] } },
    data: { status: "processing", error_message: null, updated_at: now },
  });
  if (claimed.count === 0) return 0;

  try {
    if (!rule.created_by) throw new Error("Rule theo lịch chưa có chủ sở hữu.");
    const actor = await getAuthUser(rule.created_by);
    if (!actor) throw new Error("Chủ sở hữu rule không còn hoạt động.");
    const result = await startAutomationBulkRun(actor, rule.id, { customerListId: data.scheduleCustomerListId }, dispatch.id);
    if (!result.ok) throw new Error(`Không thể tạo lượt chạy theo lịch: ${result.reason}.`);
    await prisma.automation_schedule_dispatches.update({
      where: { id: dispatch.id },
      data: { status: "dispatched", bulk_job_id: result.data.id, updated_at: new Date() },
    });
    return 1;
  } catch (error) {
    await prisma.automation_schedule_dispatches.update({
      where: { id: dispatch.id },
      data: { status: "failed", error_message: toErrorMessage(error).slice(0, 1000), updated_at: new Date() },
    });
    return 0;
  }
}

function isPrismaUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
