import { Prisma } from "../../generated/prisma/client";

import { prisma } from "../../database/prisma";
import { getAuthUser } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import {
  customerListDynamicWhere,
  normalizeCustomerListFilterConfig,
  type CustomerListFilterConfig,
} from "../customer-lists/customer-list-filter";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { startAutomationExecution } from "./automation-engine.service";
import type { AutomationGraphData } from "./automation.types";

export type AutomationBulkFilter = { customerListId: string };
export type AutomationBulkTargetSnapshot = {
  customerListId: string;
  institutionProgramId: string;
  filterConfig: CustomerListFilterConfig;
};

export async function listAccessibleAutomationCustomerLists(user: AuthUser, institutionProgramId?: string) {
  return prisma.customer_lists.findMany({
    where: {
      ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
      deleted_at: null,
      ...(!canViewEveryCustomerList(user) ? { created_by: user.id } : {}),
    },
    select: { id: true, name: true },
    orderBy: [{ updated_at: "desc" }, { id: "asc" }],
    take: 500,
  });
}

export async function previewAutomationBulkLeads(
  user: AuthUser,
  institutionProgramId: string | null,
  filter: AutomationBulkFilter,
  snapshotAt?: Date,
) {
  const resolved = await resolveBulkLeadWhere(user, institutionProgramId, filter, snapshotAt);
  if (!resolved) return null;
  const [total, sample] = await prisma.$transaction([
    prisma.leads.count({ where: resolved.where }),
    prisma.leads.findMany({
      where: resolved.where,
      select: { id: true, lead_code: true, full_name: true },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: 10,
    }),
  ]);
  return {
    total,
    sample: sample.map((lead) => ({ id: lead.id, leadCode: lead.lead_code, fullName: lead.full_name })),
    targetSnapshot: resolved.targetSnapshot,
  };
}

export async function materializeAutomationBulkDispatches(jobId: string, take = 500) {
  const existingTotal = await prisma.automation_bulk_dispatches.count({ where: { bulk_job_id: jobId } });
  if (existingTotal > 0) return existingTotal;
  const context = await loadBulkContext(jobId);
  if (!context) return null;
  const resolved = await resolveBulkLeadWhere(
    context.actor,
    context.rule.institution_program_id,
    context.filter,
    context.snapshotAt,
    context.targetSnapshot,
  );
  if (!resolved) return null;
  await prisma.$transaction(async (tx) => {
    let cursor: string | undefined;
    do {
      const leads = await tx.leads.findMany({
        where: resolved.where,
        select: { id: true },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take,
      });
      if (leads.length > 0) {
        await tx.automation_bulk_dispatches.createMany({
          data: leads.map((lead) => ({ bulk_job_id: jobId, lead_id: lead.id })),
          skipDuplicates: true,
        });
      }
      cursor = leads.at(-1)?.id;
      if (leads.length < take) break;
    } while (cursor);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 300_000 });
  return prisma.automation_bulk_dispatches.count({ where: { bulk_job_id: jobId } });
}

export async function prepareAutomationBulkLeadPage(jobId: string, cursor?: string, take = 500) {
  const dispatches = await prisma.automation_bulk_dispatches.findMany({
    where: { bulk_job_id: jobId, status: "prepared" },
    select: { id: true, lead_id: true },
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take,
  });
  return {
    leadIds: dispatches.map((dispatch) => dispatch.lead_id),
    nextCursor: dispatches.at(-1)?.id,
    hasMore: dispatches.length === take,
  };
}

export async function executeAutomationBulkLead(jobId: string, leadId: string) {
  const context = await loadBulkContext(jobId);
  if (!context) return { ok: false as const, reason: "job_not_found" as const };
  const dispatch = await prisma.automation_bulk_dispatches.findUnique({
    where: { bulk_job_id_lead_id: { bulk_job_id: jobId, lead_id: leadId } },
    select: { id: true, status: true },
  });
  if (!dispatch) return { ok: false as const, reason: "dispatch_not_found" as const };
  if (dispatch.status === "dispatched") return { ok: true as const, dispatchId: dispatch.id };
  const lead = await prisma.leads.findFirst({
    where: {
      id: leadId,
      deleted_at: null,
      ...(context.rule.institution_program_id ? { institution_program_id: context.rule.institution_program_id } : {}),
      ...getLeadScopeWhere(context.actor),
    },
    select: { id: true, institution_program_id: true },
  });
  if (!lead) return { ok: false as const, reason: "lead_not_found" as const };
  const execution = await startAutomationExecution({
    id: context.rule.id,
    version: context.rule.version,
    triggerType: context.rule.trigger_type,
    graphData: context.rule.graph_data as unknown as AutomationGraphData,
    institutionProgramId: context.rule.institution_program_id,
    createdBy: context.actor.id,
  }, {
    actorId: context.actor.id,
    leadId: lead.id,
    institutionProgramId: lead.institution_program_id ?? undefined,
    payload: { bulkJobId: jobId },
  }, "bulk", context.actor.id, dispatch.id);
  return execution.ok ? { ...execution, dispatchId: dispatch.id } : execution;
}

async function loadBulkContext(jobId: string) {
  const job = await prisma.automation_jobs.findUnique({
    where: { id: jobId },
    select: { id: true, requested_by: true, rule_id: true, payload: true },
  });
  if (!job?.requested_by || !job.rule_id) return null;
  const payload = isRecord(job.payload) ? job.payload : {};
  const customerListId = typeof payload.customerListId === "string" ? payload.customerListId : "";
  const version = typeof payload.ruleVersion === "number" ? payload.ruleVersion : 0;
  const triggerType = typeof payload.triggerType === "string" ? payload.triggerType : "";
  const graphData = isRecord(payload.graphData) ? payload.graphData as unknown as AutomationGraphData : null;
  const institutionProgramId = typeof payload.institutionProgramId === "string" ? payload.institutionProgramId : null;
  const actor = await getAuthUser(job.requested_by, institutionProgramId ?? undefined);
  if (!actor?.permissions.includes("automation.manage")) return null;
  const snapshotAt = typeof payload.snapshotAt === "string" ? new Date(payload.snapshotAt) : null;
  const target = isRecord(payload.targetSnapshot) ? payload.targetSnapshot : null;
  const targetCustomerListId = typeof target?.customerListId === "string" ? target.customerListId : "";
  const targetProgramId = typeof target?.institutionProgramId === "string" ? target.institutionProgramId : "";
  if (
    !customerListId || !version || !triggerType || !graphData || !snapshotAt
    || Number.isNaN(snapshotAt.getTime()) || targetCustomerListId !== customerListId || !targetProgramId
  ) return null;
  const targetSnapshot: AutomationBulkTargetSnapshot = {
    customerListId: targetCustomerListId,
    institutionProgramId: targetProgramId,
    filterConfig: normalizeCustomerListFilterConfig(target?.filterConfig as Prisma.JsonValue | undefined),
  };
  return {
    actor,
    rule: { id: job.rule_id, version, trigger_type: triggerType, graph_data: graphData, institution_program_id: institutionProgramId },
    filter: { customerListId },
    snapshotAt,
    targetSnapshot,
  };
}

async function resolveBulkLeadWhere(
  user: AuthUser,
  institutionProgramId: string | null,
  filter: AutomationBulkFilter,
  snapshotAt?: Date,
  targetSnapshot?: AutomationBulkTargetSnapshot,
) {
  const target = targetSnapshot ?? await loadBulkTargetSnapshot(user, institutionProgramId, filter);
  if (!target || target.customerListId !== filter.customerListId) return null;
  const dynamic = customerListDynamicWhere(target.filterConfig, snapshotAt);
  const membership: Prisma.leadsWhereInput = {
    OR: [
      ...(dynamic ? [dynamic] : []),
      { customer_list_members: { some: { customer_list_id: target.customerListId } } },
    ],
  };
  return {
    where: {
      AND: [
        { deleted_at: null },
        { institution_program_id: target.institutionProgramId },
        ...(snapshotAt ? [{ created_at: { lte: snapshotAt } }] : []),
        getLeadScopeWhere(user),
        membership,
      ],
    } satisfies Prisma.leadsWhereInput,
    institutionProgramId: target.institutionProgramId,
    targetSnapshot: target,
  };
}

async function loadBulkTargetSnapshot(
  user: AuthUser,
  institutionProgramId: string | null,
  filter: AutomationBulkFilter,
): Promise<AutomationBulkTargetSnapshot | null> {
  const list = await prisma.customer_lists.findFirst({
    where: {
      id: filter.customerListId,
      ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
      deleted_at: null,
      ...(!canViewEveryCustomerList(user) ? { created_by: user.id } : {}),
    },
    select: { id: true, filter_config: true, institution_program_id: true },
  });
  if (!list?.institution_program_id) return null;
  return {
    customerListId: list.id,
    institutionProgramId: list.institution_program_id,
    filterConfig: normalizeCustomerListFilterConfig(list.filter_config),
  };
}

function canViewEveryCustomerList(user: AuthUser) {
  return user.permissions.includes("customer_list.view_all") || user.permissions.includes("customer_list.manage");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
