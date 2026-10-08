import { prisma } from "../../../database/prisma";
import type { AuthUser } from "../../auth/auth.types";
import { triggerAutomation } from "../../automations/automation-engine.service";
import { getPipelineStageMarker, isFailedLeadStatus } from "../domain/lead-lifecycle-status";
import { getLeadScopeWhere } from "../lead-list.service";
import { canUpdateLead } from "./lead-authorization";
import { recordStageChange } from "./lead-mutation-support";

export async function initializeLeadOnOpen(actor: AuthUser, leadId: string, institutionProgramId?: string, ipAddress?: string) {
  const mayInitializePipeline = canUpdateLead(actor);
  const result = await prisma.$transaction(async (tx) => {
    const scope = { ...getLeadScopeWhere(actor, institutionProgramId), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) };
    const lead = await tx.leads.findFirst({
      where: { ...scope, id: leadId, deleted_at: null },
      select: { assigned_to: true, pipeline_stage_id: true, status: true },
    });
    if (!lead) return { ok: false as const, reason: "lead_not_found" as const };

    const openedAt = new Date();
    let assignmentOpened = false;
    if (lead.assigned_to === actor.id) {
      const assignment = await tx.lead_assignments.findFirst({
        where: {
          lead_id: leadId,
          assigned_to: actor.id,
          is_main_owner: true,
        },
        select: { id: true },
        orderBy: [{ assigned_at: "desc" }, { id: "desc" }],
      });
      if (assignment) {
        const opened = await tx.lead_assignments.updateMany({
          where: {
            id: assignment.id,
            lead_id: leadId,
            assigned_to: actor.id,
            is_main_owner: true,
            first_opened_at: null,
          },
          data: { first_opened_at: openedAt },
        });
        assignmentOpened = opened.count > 0;
        if (assignmentOpened) {
          await tx.lead_activities.create({
            data: {
              lead_id: leadId,
              user_id: actor.id,
              type: "lead_opened",
              content: "Nhân viên phụ trách mở bản ghi Lead lần đầu kể từ khi được phân công.",
            },
          });
          await tx.audit_logs.create({
            data: {
              user_id: actor.id,
              entity_type: "lead_assignment",
              entity_id: assignment.id,
              action: "first_open",
              ip_address: ipAddress,
              new_data: { leadId, firstOpenedAt: openedAt.toISOString() },
            },
          });
        }
      }
    }

    if (!mayInitializePipeline || lead.assigned_to !== actor.id || lead.pipeline_stage_id || isFailedLeadStatus(lead.status)) {
      return { ok: true as const, data: { id: leadId, changed: false, assignmentOpened } };
    }
    // Stages are global in the current schema. Never guess between multiple Sale L0 definitions.
    const stages = await tx.pipeline_stages.findMany({
      where: { pipelines: { module: "sale" }, name: { contains: "L0", mode: "insensitive" } },
      select: { id: true, name: true },
    });
    const candidates = stages.filter((stage) => getPipelineStageMarker(stage.name) === "L0");
    if (candidates.length !== 1) {
      return {
        ok: true as const,
        data: {
          id: leadId,
          changed: false,
          assignmentOpened,
          pipelineInitializationIssue: "initial_stage_unavailable" as const,
        },
      };
    }
    const stage = candidates[0]!;
    // Compare-and-set protects against duplicate opens, reassignment and concurrent stage changes.
    const updated = await tx.leads.updateMany({
      where: { ...scope, id: leadId, deleted_at: null, assigned_to: actor.id, pipeline_stage_id: null, status: lead.status },
      data: { pipeline_stage_id: stage.id, updated_at: new Date() },
    });
    if (!updated.count) return { ok: true as const, data: { id: leadId, changed: false, assignmentOpened } };
    await recordStageChange(tx, actor, leadId, null, stage, {
      activityContent: "Tự động chuyển lead sang tiến trình L0 khi nhân viên phụ trách mở bản ghi.",
      includeStageNameInAudit: true, ipAddress,
    });
    return { ok: true as const, data: { id: leadId, changed: true, assignmentOpened } };
  });
  if (result.ok && result.data.changed) {
    triggerAutomation("lead_pipeline_stage_changed", { leadId, actorId: actor.id, institutionProgramId }).catch(console.error);
  }
  return result;
}
