import { prisma } from "../../../database/prisma";
import type { AuthUser } from "../../auth/auth.types";
import { triggerAutomation } from "../../automations/automation-engine.service";
import { getLeadScopeWhere } from "../lead-list.service";
import { canAssignLead, isAssigneeInScope } from "./lead-authorization";
import {
  findActiveAssignableSale,
  selectAssigneeDepartment,
} from "./lead-mutation-support";

export async function assignLeads(
  actor: AuthUser,
  leadIds: string[],
  input: { assigneeId: string },
  institutionProgramId?: string,
  ipAddress?: string,
) {
  if (!canAssignLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }

  const uniqueLeadIds = [...new Set(leadIds)];
  const result = await prisma.$transaction(async (tx) => {
    const leads = await tx.leads.findMany({
      where: {
        id: { in: uniqueLeadIds },
        deleted_at: null,
        ...getLeadScopeWhere(actor, institutionProgramId),
        ...(institutionProgramId
          ? { institution_program_id: institutionProgramId }
          : {}),
      },
      select: { id: true, full_name: true, assigned_to: true },
    });
    if (leads.length !== uniqueLeadIds.length) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }

    const assignee = await findActiveAssignableSale(tx, input.assigneeId, undefined, institutionProgramId);
    const assigneeInScope =
      assignee && isAssigneeInScope(actor, assignee.user_departments);
    if (!assignee || !assigneeInScope) {
      return { ok: false as const, reason: "assignee_not_found" as const };
    }

    const departmentId = selectAssigneeDepartment(
      actor,
      assignee.user_departments,
    );

    await tx.lead_assignments.updateMany({
      where: { lead_id: { in: uniqueLeadIds }, is_main_owner: true },
      data: { is_main_owner: false },
    });
    await tx.lead_assignments.createMany({
      data: leads.map((lead) => ({
        lead_id: lead.id,
        assigned_to: assignee.id,
        assigned_by: actor.id,
        department_id: departmentId,
        is_main_owner: true,
      })),
    });
    await tx.leads.updateMany({
      where: { id: { in: uniqueLeadIds } },
      data: { assigned_to: assignee.id, updated_at: new Date() },
    });
    await tx.lead_activities.createMany({
      data: leads.map((lead) => ({
        lead_id: lead.id,
        user_id: actor.id,
        type: "lead_assigned",
        content: `Phân công lead cho ${assignee.full_name}.`,
      })),
    });
    await tx.notifications.createMany({
      data: leads.map((lead) => ({
        user_id: assignee.id,
        title: "Bạn được phân công lead mới",
        content: `Lead ${lead.full_name} đã được phân công cho bạn.`,
        type: "lead_assignment",
      })),
    });
    await tx.audit_logs.createMany({
      data: leads.map((lead) => ({
        user_id: actor.id,
        entity_type: "lead",
        entity_id: lead.id,
        action: lead.assigned_to ? "reassign" : "assign",
        ip_address: ipAddress,
        old_data: { assigneeId: lead.assigned_to },
        new_data: { assigneeId: assignee.id, departmentId },
      })),
    });

    return {
      ok: true as const,
      data: {
        leadIds: uniqueLeadIds,
        assigneeId: assignee.id,
        assignedCount: uniqueLeadIds.length,
      },
    };
  });

  if (result.ok) {
    await Promise.all(
      result.data.leadIds.map((leadId) =>
        triggerAutomation("lead_assigned", {
          leadId,
          institutionProgramId: institutionProgramId ?? undefined,
        }).catch(console.error),
      ),
    );
  }
  return result;
}
