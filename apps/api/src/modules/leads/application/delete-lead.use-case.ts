import { prisma } from "../../../database/prisma";
import type { AuthUser } from "../../auth/auth.types";
import { getLeadScopeWhere } from "../lead-list.service";
import { findVisibleLeadForMutation } from "./lead-mutation-support";

function canDeleteLead(actor: AuthUser) {
  return actor.permissions.includes("lead.delete");
}

export async function deleteLead(
  actor: AuthUser,
  leadId: string,
  institutionProgramId?: string,
  ipAddress?: string,
) {
  if (!canDeleteLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  return prisma.$transaction(async (tx) => {
    const lead = await findVisibleLeadForMutation(
      actor,
      leadId,
      institutionProgramId,
      tx,
    );
    if (!lead) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }
    await tx.leads.update({
      where: { id: leadId },
      data: { deleted_at: new Date(), updated_at: new Date() },
    });
    await tx.lead_activities.create({
      data: {
        lead_id: leadId,
        user_id: actor.id,
        type: "lead_deleted",
        content: "Xóa lead khỏi danh sách hoạt động.",
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "lead",
        entity_id: leadId,
        action: "delete",
        ip_address: ipAddress,
        old_data: {
          fullName: lead.full_name,
          pipelineStageId: lead.pipeline_stage_id,
          assigneeId: lead.assigned_to,
        },
        new_data: { deleted: true },
      },
    });
    return { ok: true as const, data: { id: leadId } };
  });
}

export async function deleteLeads(
  actor: AuthUser,
  leadIds: string[],
  institutionProgramId?: string,
  ipAddress?: string,
) {
  if (!canDeleteLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  const uniqueLeadIds = [...new Set(leadIds)];

  return prisma.$transaction(async (tx) => {
    const leads = await tx.leads.findMany({
      where: {
        id: { in: uniqueLeadIds },
        deleted_at: null,
        ...getLeadScopeWhere(actor, institutionProgramId),
        ...(institutionProgramId
          ? { institution_program_id: institutionProgramId }
          : {}),
      },
      select: {
        id: true,
        full_name: true,
        pipeline_stage_id: true,
        assigned_to: true,
      },
    });
    if (leads.length !== uniqueLeadIds.length) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }

    const deletedAt = new Date();
    await tx.leads.updateMany({
      where: { id: { in: uniqueLeadIds }, deleted_at: null },
      data: { deleted_at: deletedAt, updated_at: deletedAt },
    });
    await tx.lead_activities.createMany({
      data: leads.map((lead) => ({
        lead_id: lead.id,
        user_id: actor.id,
        type: "lead_deleted",
        content: "Xóa lead khỏi danh sách hoạt động.",
      })),
    });
    await tx.audit_logs.createMany({
      data: leads.map((lead) => ({
        user_id: actor.id,
        entity_type: "lead",
        entity_id: lead.id,
        action: "delete",
        ip_address: ipAddress,
        old_data: {
          fullName: lead.full_name,
          pipelineStageId: lead.pipeline_stage_id,
          assigneeId: lead.assigned_to,
        },
        new_data: { deleted: true, bulk: true },
      })),
    });

    return {
      ok: true as const,
      data: {
        leadIds: uniqueLeadIds,
        deletedCount: uniqueLeadIds.length,
      },
    };
  });
}
