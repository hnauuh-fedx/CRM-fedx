import { prisma } from "../../../database/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { getLeadScopeWhere } from "../lead-list.service";
import {
  canAssignLead,
  canUseAssignmentDepartment,
  canUpdateLead,
} from "./lead-authorization";
import { recordStageChange } from "./lead-mutation-support";

export type LeadMutationTransactionEffect = (
  tx: Prisma.TransactionClient,
) => Promise<void>;

type LeadAssignmentInput = {
  assigneeId?: string;
  departmentId?: string;
  resolveAssigneeId?: (tx: Prisma.TransactionClient) => Promise<string>;
};

export { leadUpdatePermissions } from "./lead-authorization";

export async function changeVisibleLeadStage(
  actor: AuthUser,
  leadId: string,
  stageId: string,
  institutionProgramId?: string,
  transactionEffect?: LeadMutationTransactionEffect,
  ipAddress?: string,
) {
  if (!canUpdateLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }

  return prisma.$transaction(async (tx) => {
    const lead = await findVisibleLead(
      actor,
      leadId,
      institutionProgramId,
      tx,
    );
    if (!lead) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }
    const stage = await tx.pipeline_stages.findUnique({
      where: { id: stageId },
      select: { id: true, name: true },
    });
    if (!stage) {
      return { ok: false as const, reason: "stage_not_found" as const };
    }
    if (lead.pipeline_stage_id === stageId) {
      await transactionEffect?.(tx);
      return {
        ok: true as const,
        data: { id: leadId, pipelineStageId: stageId, changed: false },
      };
    }

    await tx.leads.update({
      where: { id: leadId },
      data: { pipeline_stage_id: stageId, updated_at: new Date() },
    });
    await recordStageChange(tx, actor, leadId, lead.pipeline_stage_id, stage, {
      activityContent: `Chuyển lead sang giai đoạn ${stage.name}.`,
      includeStageNameInAudit: true,
      ipAddress,
    });
    await transactionEffect?.(tx);
    return {
      ok: true as const,
      data: { id: leadId, pipelineStageId: stageId, changed: true },
    };
  });
}

export async function assignVisibleLead(
  actor: AuthUser,
  leadId: string,
  input: LeadAssignmentInput,
  institutionProgramId?: string,
  transactionEffect?: LeadMutationTransactionEffect,
  ipAddress?: string,
) {
  if (!canAssignLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  if (
    input.departmentId &&
    !canUseAssignmentDepartment(actor, input.departmentId)
  ) {
    return { ok: false as const, reason: "assignee_not_found" as const };
  }

  return prisma.$transaction(async (tx) => {
    const lead = await findVisibleLead(
      actor,
      leadId,
      institutionProgramId,
      tx,
    );
    if (!lead) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }
    const assigneeId = input.resolveAssigneeId
      ? await input.resolveAssigneeId(tx)
      : input.assigneeId;
    if (!assigneeId) {
      return { ok: false as const, reason: "assignee_not_found" as const };
    }
    const canAssignAll =
      actor.accessScope === "ALL" && actor.permissions.includes("lead.view_all");
    const assignee = await tx.users.findFirst({
      where: {
        id: assigneeId,
        status: "active",
        deleted_at: null,
        user_roles: {
          some: {
            roles: {
              role_permissions: {
                some: { permissions: { code: "lead.view_assigned" } },
                none: {
                  permissions: {
                    code: { in: ["lead.view_department", "lead.view_all"] },
                  },
                },
              },
            },
          },
        },
        AND: [
          canAssignAll
            ? {}
            : (actor.accessScope === "DEPARTMENT" ||
                  actor.permissions.includes("lead.view_department")) &&
                actor.departmentIds.length > 0
              ? {
                  user_departments: {
                    some: { department_id: { in: actor.departmentIds } },
                  },
                }
              : { id: actor.id },
          ...(input.departmentId
            ? [
                {
                  user_departments: {
                    some: { department_id: input.departmentId },
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        full_name: true,
        user_departments: {
          select: { department_id: true },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!assignee) {
      return { ok: false as const, reason: "assignee_not_found" as const };
    }

    const departmentId =
      input.departmentId ??
      assignee.user_departments.find(
        (membership) =>
          membership.department_id &&
          actor.departmentIds.includes(membership.department_id),
      )?.department_id ??
      assignee.user_departments[0]?.department_id ??
      null;

    await tx.lead_assignments.updateMany({
      where: { lead_id: leadId, is_main_owner: true },
      data: { is_main_owner: false },
    });
    await tx.lead_assignments.create({
      data: {
        lead_id: leadId,
        assigned_to: assignee.id,
        assigned_by: actor.id,
        department_id: departmentId,
        is_main_owner: true,
      },
    });
    await tx.leads.update({
      where: { id: leadId },
      data: { assigned_to: assignee.id, updated_at: new Date() },
    });
    await tx.lead_activities.create({
      data: {
        lead_id: leadId,
        user_id: actor.id,
        type: "lead_assigned",
        content: `Phân công lead cho ${assignee.full_name}.`,
      },
    });
    await tx.notifications.create({
      data: {
        user_id: assignee.id,
        title: "Bạn được phân công lead mới",
        content: `Lead ${lead.full_name} đã được phân công cho bạn.`,
        type: "lead_assignment",
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "lead",
        entity_id: leadId,
        action: lead.assigned_to ? "reassign" : "assign",
        ip_address: ipAddress,
        old_data: { assigneeId: lead.assigned_to },
        new_data: { assigneeId: assignee.id, departmentId },
      },
    });
    await transactionEffect?.(tx);
    return {
      ok: true as const,
      data: { id: leadId, assigneeId: assignee.id },
    };
  });
}

async function findVisibleLead(
  actor: AuthUser,
  leadId: string,
  institutionProgramId?: string,
  client: Pick<Prisma.TransactionClient, "leads"> = prisma,
) {
  return client.leads.findFirst({
    where: {
      id: leadId,
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
}
