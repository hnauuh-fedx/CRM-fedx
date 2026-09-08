import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "./lead-list.service";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type LeadMutationTransactionEffect = (tx: TransactionClient) => Promise<void>;

function toStageStatus(stage: { name: string }) {
  return stage.name.trim().slice(0, 50) || null;
}

export const leadUpdatePermissions = [
  "lead.update_all",
  "lead.update_department",
  "lead.update_assigned",
] as const;

export async function changeVisibleLeadStage(
  actor: AuthUser,
  leadId: string,
  stageId: string,
  institutionProgramId?: string,
  transactionEffect?: LeadMutationTransactionEffect,
) {
  if (!leadUpdatePermissions.some((permission) => actor.permissions.includes(permission))) {
    return { ok: false as const, reason: "permission_denied" as const };
  }

  const lead = await findVisibleLead(actor, leadId, institutionProgramId);
  if (!lead) return { ok: false as const, reason: "lead_not_found" as const };

  return prisma.$transaction(async (tx) => {
    const stage = await tx.pipeline_stages.findUnique({ where: { id: stageId }, select: { id: true, name: true } });
    if (!stage) return { ok: false as const, reason: "stage_not_found" as const };
    if (lead.pipeline_stage_id === stageId) {
      if (lead.status !== toStageStatus(stage)) {
        await tx.leads.update({
          where: { id: leadId },
          data: { status: toStageStatus(stage), updated_at: new Date() },
        });
      }
      await transactionEffect?.(tx);
      return { ok: true as const, data: { id: leadId, pipelineStageId: stageId, changed: false } };
    }

    await tx.leads.update({
      where: { id: leadId },
      data: { pipeline_stage_id: stageId, status: toStageStatus(stage), updated_at: new Date() },
    });
    await tx.lead_status_histories.create({
      data: { lead_id: leadId, from_stage_id: lead.pipeline_stage_id, to_stage_id: stageId, changed_by: actor.id },
    });
    await tx.lead_activities.create({
      data: {
        lead_id: leadId,
        user_id: actor.id,
        type: "pipeline_stage_changed",
        content: `Chuyển lead sang giai đoạn ${stage.name}.`,
        metadata: { fromStageId: lead.pipeline_stage_id, toStageId: stageId },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "lead",
        entity_id: leadId,
        action: "pipeline_stage_changed",
        old_data: { pipelineStageId: lead.pipeline_stage_id },
        new_data: { pipelineStageId: stageId, status: toStageStatus(stage) },
      },
    });
    await transactionEffect?.(tx);
    return { ok: true as const, data: { id: leadId, pipelineStageId: stageId, changed: true } };
  });
}

export async function assignVisibleLead(
  actor: AuthUser,
  leadId: string,
  input: { assigneeId: string; departmentId?: string },
  institutionProgramId?: string,
  transactionEffect?: LeadMutationTransactionEffect,
) {
  if (!actor.permissions.includes("lead.assign") && !actor.permissions.includes("lead.reassign")) {
    return { ok: false as const, reason: "permission_denied" as const };
  }

  const lead = await findVisibleLead(actor, leadId, institutionProgramId);
  if (!lead) return { ok: false as const, reason: "lead_not_found" as const };

  return prisma.$transaction(async (tx) => {
    const canAssignAll = actor.accessScope === "ALL" && actor.permissions.includes("lead.view_all");
    const assignee = await tx.users.findFirst({
      where: {
        id: input.assigneeId,
        status: "active",
        deleted_at: null,
        user_roles: {
          some: {
            roles: {
              role_permissions: {
                some: { permissions: { code: "lead.view_assigned" } },
                none: { permissions: { code: { in: ["lead.view_department", "lead.view_all"] } } },
              },
            },
          },
        },
        AND: [
          canAssignAll
            ? {}
            : (actor.accessScope === "DEPARTMENT" || actor.permissions.includes("lead.view_department")) && actor.departmentIds.length > 0
              ? { user_departments: { some: { department_id: { in: actor.departmentIds } } } }
              : { id: actor.id },
          ...(input.departmentId ? [{ user_departments: { some: { department_id: input.departmentId } } }] : []),
        ],
      },
      select: {
        id: true,
        full_name: true,
        user_departments: { select: { department_id: true }, orderBy: { id: "asc" } },
      },
    });
    if (!assignee) return { ok: false as const, reason: "assignee_not_found" as const };
    const departmentId = input.departmentId
      ?? assignee.user_departments.find(
        (membership) => membership.department_id && actor.departmentIds.includes(membership.department_id),
      )?.department_id
      ?? assignee.user_departments[0]?.department_id
      ?? null;

    await tx.lead_assignments.updateMany({ where: { lead_id: leadId, is_main_owner: true }, data: { is_main_owner: false } });
    await tx.lead_assignments.create({
      data: {
        lead_id: leadId,
        assigned_to: assignee.id,
        assigned_by: actor.id,
        department_id: departmentId,
        is_main_owner: true,
      },
    });
    await tx.leads.update({ where: { id: leadId }, data: { assigned_to: assignee.id, updated_at: new Date() } });
    await tx.lead_activities.create({
      data: { lead_id: leadId, user_id: actor.id, type: "lead_assigned", content: `Phân công lead cho ${assignee.full_name}.` },
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
        old_data: { assigneeId: lead.assigned_to },
        new_data: { assigneeId: assignee.id, departmentId },
      },
    });
    await transactionEffect?.(tx);
    return { ok: true as const, data: { id: leadId, assigneeId: assignee.id } };
  });
}

async function findVisibleLead(actor: AuthUser, leadId: string, institutionProgramId?: string) {
  return prisma.leads.findFirst({
    where: {
      id: leadId,
      deleted_at: null,
      ...getLeadScopeWhere(actor),
      ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
    },
    select: { id: true, full_name: true, status: true, pipeline_stage_id: true, assigned_to: true },
  });
}
