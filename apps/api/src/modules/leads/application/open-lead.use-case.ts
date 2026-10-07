import { prisma } from "../../../database/prisma";
import type { AuthUser } from "../../auth/auth.types";
import { triggerAutomation } from "../../automations/automation-engine.service";
import { getPipelineStageMarker, isFailedLeadStatus } from "../domain/lead-lifecycle-status";
import { getLeadScopeWhere } from "../lead-list.service";
import { canUpdateLead } from "./lead-authorization";
import { recordStageChange } from "./lead-mutation-support";

export async function initializeLeadOnOpen(actor: AuthUser, leadId: string, institutionProgramId?: string, ipAddress?: string) {
  if (!canUpdateLead(actor)) return { ok: false as const, reason: "permission_denied" as const };
  const result = await prisma.$transaction(async (tx) => {
    const scope = { ...getLeadScopeWhere(actor, institutionProgramId), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) };
    const lead = await tx.leads.findFirst({
      where: { ...scope, id: leadId, deleted_at: null },
      select: { assigned_to: true, pipeline_stage_id: true, status: true },
    });
    if (!lead) return { ok: false as const, reason: "lead_not_found" as const };
    if (lead.assigned_to !== actor.id || lead.pipeline_stage_id || isFailedLeadStatus(lead.status)) {
      return { ok: true as const, data: { id: leadId, changed: false } };
    }
    // Stages are global in the current schema. Never guess between multiple Sale L0 definitions.
    const stages = await tx.pipeline_stages.findMany({
      where: { pipelines: { module: "sale" }, name: { contains: "L0", mode: "insensitive" } },
      select: { id: true, name: true },
    });
    const candidates = stages.filter((stage) => getPipelineStageMarker(stage.name) === "L0");
    if (candidates.length !== 1) return { ok: false as const, reason: "initial_stage_unavailable" as const };
    const stage = candidates[0]!;
    // Compare-and-set protects against duplicate opens, reassignment and concurrent stage changes.
    const updated = await tx.leads.updateMany({
      where: { ...scope, id: leadId, deleted_at: null, assigned_to: actor.id, pipeline_stage_id: null, status: lead.status },
      data: { pipeline_stage_id: stage.id, updated_at: new Date() },
    });
    if (!updated.count) return { ok: true as const, data: { id: leadId, changed: false } };
    await recordStageChange(tx, actor, leadId, null, stage, {
      activityContent: "Tự động chuyển lead sang tiến trình L0 khi nhân viên phụ trách mở bản ghi.",
      includeStageNameInAudit: true, ipAddress,
    });
    return { ok: true as const, data: { id: leadId, changed: true } };
  });
  if (result.ok && result.data.changed) {
    triggerAutomation("lead_pipeline_stage_changed", { leadId, actorId: actor.id, institutionProgramId }).catch(console.error);
  }
  return result;
}
