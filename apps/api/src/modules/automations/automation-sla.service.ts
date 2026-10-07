import { Prisma } from "../../generated/prisma/client";

import { prisma } from "../../database/prisma";
import { getAuthUser } from "../auth/auth.service";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { startAutomationExecution } from "./automation-engine.service";
import type { AutomationGraphData } from "./automation.types";

const HUMAN_HANDLING_ACTIVITY_TYPES = ["call", "email", "meeting", "consultation", "follow_up", "other"];

type PendingSlaDispatch = {
  id: string;
  lead_id: string;
  institution_program_id: string | null;
};

export async function dispatchDueSlaAutomations(now = new Date(), batchSize = 200) {
  const rules = await prisma.automation_rules.findMany({
    where: { is_active: true, archived_at: null, trigger_type: "lead_unprocessed" },
    select: { id: true, version: true, trigger_type: true, graph_data: true, institution_program_id: true, created_by: true },
  });
  let dispatched = 0;

  for (const rule of rules) {
    const graph = rule.graph_data as unknown as AutomationGraphData;
    const trigger = graph.nodes.find((node) => node.type === "trigger");
    const slaMinutes = Number(trigger?.data.slaMinutes);
    if (!Number.isFinite(slaMinutes) || slaMinutes <= 0 || !rule.created_by) continue;
    const actor = await getAuthUser(rule.created_by, rule.institution_program_id ?? undefined);
    if (!actor) continue;
    const cutoff = new Date(now.getTime() - slaMinutes * 60_000);
    const programId = rule.institution_program_id;
    const pending = await prisma.$queryRaw<PendingSlaDispatch[]>(Prisma.sql`
      SELECT dispatch.id, dispatch.lead_id, lead.institution_program_id
      FROM automation_sla_dispatches AS dispatch
      INNER JOIN leads AS lead ON lead.id = dispatch.lead_id
      LEFT JOIN automation_execution_logs AS execution ON execution.id = dispatch.id
      WHERE dispatch.rule_id = ${rule.id}::uuid
        AND lead.deleted_at IS NULL
        AND (
          execution.id IS NULL
          OR (execution.status = 'processing' AND execution.updated_at <= ${new Date(now.getTime() - 5 * 60_000)})
        )
      ORDER BY dispatch.created_at ASC, dispatch.id ASC
      LIMIT ${batchSize}
    `);

    let actionablePending = 0;
    for (const dispatch of pending) {
      const lead = await prisma.leads.findFirst({
        where: {
          id: dispatch.lead_id,
          deleted_at: null,
          ...(programId ? { institution_program_id: programId } : {}),
          ...getLeadScopeWhere(actor),
        },
        select: { id: true, institution_program_id: true },
      });
      if (!lead) {
        await prisma.automation_sla_dispatches.deleteMany({ where: { id: dispatch.id } });
        continue;
      }
      actionablePending += 1;
      if (await startSlaExecution(rule, graph, lead, dispatch.id, slaMinutes, now)) dispatched += 1;
    }

    const remaining = Math.max(0, batchSize - actionablePending);
    if (remaining === 0) continue;
    const leads = await prisma.leads.findMany({
      where: {
        deleted_at: null,
        created_at: { lte: cutoff },
        ...(programId ? { institution_program_id: programId } : {}),
        ...getLeadScopeWhere(actor),
        lead_activities: {
          none: {
            OR: [
              { type: { in: HUMAN_HANDLING_ACTIVITY_TYPES } },
              { metadata: { path: ["origin"], equals: "manual" } },
            ],
          },
        },
        automation_sla_dispatches: { none: { rule_id: rule.id } },
      },
      select: { id: true, institution_program_id: true },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: remaining,
    });

    for (const lead of leads) {
      const dispatch = await prisma.automation_sla_dispatches.upsert({
        where: { rule_id_lead_id: { rule_id: rule.id, lead_id: lead.id } },
        update: {},
        create: { rule_id: rule.id, lead_id: lead.id },
        select: { id: true },
      });
      if (await startSlaExecution(rule, graph, lead, dispatch.id, slaMinutes, now)) dispatched += 1;
    }
  }
  return { dispatched };
}

async function startSlaExecution(
  rule: {
    id: string;
    version: number;
    trigger_type: string;
    institution_program_id: string | null;
    created_by: string | null;
  },
  graph: AutomationGraphData,
  lead: { id: string; institution_program_id: string | null },
  dispatchId: string,
  slaMinutes: number,
  detectedAt: Date,
) {
  try {
    const result = await startAutomationExecution({
      id: rule.id,
      version: rule.version,
      triggerType: rule.trigger_type,
      graphData: graph,
      institutionProgramId: rule.institution_program_id,
      createdBy: rule.created_by,
    }, {
      actorId: rule.created_by ?? undefined,
      leadId: lead.id,
      institutionProgramId: lead.institution_program_id ?? undefined,
      payload: { slaMinutes, detectedAt: detectedAt.toISOString() },
    }, "event", null, undefined, dispatchId);
    if (result.ok) return true;
  } catch (error) {
    console.error("Automation SLA execution failed to start", { ruleId: rule.id, leadId: lead.id, error });
    const execution = await prisma.automation_execution_logs.findUnique({
      where: { id: dispatchId },
      select: { status: true },
    });
    if (execution && execution.status !== "failed") return true;
  }
  await prisma.automation_sla_dispatches.deleteMany({ where: { id: dispatchId } });
  return false;
}
