import { prisma } from "../../../database/prisma";
import { Prisma } from "../../../generated/prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { getLeadScopeWhere } from "../lead-list.service";
import {
  ACTIVE_LEAD_STATUS,
  createFailedLeadStatus,
  getFailedLeadStageId,
  getPipelineStageMarker,
  isFailedLeadStatus,
  type LeadLifecycleStatus,
} from "../domain/lead-lifecycle-status";
import {
  canAssignLead,
  canUseAssignmentDepartment,
  canUpdateLead,
} from "./lead-authorization";
import { recordStageChange } from "./lead-mutation-support";
import { recordTransitionNote, resolveTransitionNote } from "../transition-note.service";

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
  noteTemplateId?: string,
  noteContent?: string,
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
    if (isFailedLeadStatus(lead.status)) {
      return { ok: false as const, reason: "lead_failed" as const };
    }
    if (lead.pipeline_stage_id === stageId) {
      await transactionEffect?.(tx);
      return {
        ok: true as const,
        data: { id: leadId, pipelineStageId: stageId, changed: false },
      };
    }

    const note = await resolveTransitionNote(tx, stage.id, stage.name, noteTemplateId, noteContent);
    if (!note.ok) return note;
    await tx.leads.update({
      where: { id: leadId },
      data: { pipeline_stage_id: stageId, updated_at: new Date() },
    });
    await recordStageChange(tx, actor, leadId, lead.pipeline_stage_id, stage, {
      activityContent: `Chuyển lead sang giai đoạn ${stage.name}.`,
      includeStageNameInAudit: true,
      ipAddress,
    });
    await recordTransitionNote(tx, actor, leadId, note.content, noteTemplateId, ipAddress);
    await transactionEffect?.(tx);
    return {
      ok: true as const,
      data: { id: leadId, pipelineStageId: stageId, changed: true },
    };
  });
}

export async function changeVisibleLeadStatus(
  actor: AuthUser,
  leadId: string,
  status: LeadLifecycleStatus,
  institutionProgramId?: string,
  ipAddress?: string,
  noteTemplateId?: string,
  noteContent?: string,
) {
  if (!canUpdateLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }

  return prisma.$transaction(async (tx) => {
    const lead = await findVisibleLead(actor, leadId, institutionProgramId, tx);
    if (!lead) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }

    const failedStageId = getFailedLeadStageId(lead.status);
    if (status === "FAIL") {
      if (failedStageId) {
        return {
          ok: true as const,
          data: {
            id: leadId,
            status: "FAIL" as const,
            statusLabel: "Fail",
            pipelineStageId: null,
            changed: false,
          },
        };
      }
      if (!lead.pipeline_stage_id) {
        return { ok: false as const, reason: "stage_required" as const };
      }
      const stage = await tx.pipeline_stages.findUnique({
        where: { id: lead.pipeline_stage_id },
        select: { id: true, name: true },
      });
      if (!stage) {
        return { ok: false as const, reason: "stage_not_found" as const };
      }
      const marker = getPipelineStageMarker(stage.name);
      const statusLabel = marker ? `Fail | ${marker}` : "Fail";
      const nextStatus = createFailedLeadStatus(stage.id);
      const note = await resolveTransitionNote(tx, "FAIL", "Fail", noteTemplateId, noteContent);
      if (!note.ok) return note;

      await tx.leads.update({
        where: { id: leadId },
        data: {
          status: nextStatus,
          pipeline_stage_id: null,
          updated_at: new Date(),
        },
      });
      await recordStageChange(tx, actor, leadId, stage.id, null, {
        activityContent: `Chuyển trạng thái lead sang ${statusLabel}.`,
        ipAddress,
      });
      await recordLifecycleStatusAudit(
        tx,
        actor,
        leadId,
        ACTIVE_LEAD_STATUS,
        nextStatus,
        stage.id,
        null,
        ipAddress,
      );
      await recordTransitionNote(tx, actor, leadId, note.content, noteTemplateId, ipAddress);

      return {
        ok: true as const,
        data: {
          id: leadId,
          status: "FAIL" as const,
          statusLabel,
          pipelineStageId: null,
          changed: true,
        },
      };
    }

    if (!failedStageId) {
      return {
        ok: true as const,
        data: {
          id: leadId,
          status: "ACTIVE" as const,
          statusLabel: "Active",
          pipelineStageId: lead.pipeline_stage_id,
          changed: false,
        },
      };
    }
    const restoredStage = await tx.pipeline_stages.findUnique({
      where: { id: failedStageId },
      select: { id: true, name: true },
    });
    if (!restoredStage) {
      return { ok: false as const, reason: "stage_not_found" as const };
    }
    const note = await resolveTransitionNote(tx, restoredStage.id, restoredStage.name, noteTemplateId, noteContent);
    if (!note.ok) return note;

    await tx.leads.update({
      where: { id: leadId },
      data: {
        status: ACTIVE_LEAD_STATUS,
        pipeline_stage_id: restoredStage.id,
        updated_at: new Date(),
      },
    });
    await recordStageChange(tx, actor, leadId, null, restoredStage, {
      activityContent: `Kích hoạt lại lead tại tiến trình ${getPipelineStageMarker(restoredStage.name) ?? restoredStage.name}.`,
      includeStageNameInAudit: true,
      ipAddress,
    });
    await recordLifecycleStatusAudit(
      tx,
      actor,
      leadId,
      lead.status,
      ACTIVE_LEAD_STATUS,
      null,
      restoredStage.id,
      ipAddress,
    );
    await recordTransitionNote(tx, actor, leadId, note.content, noteTemplateId, ipAddress);

    return {
      ok: true as const,
      data: {
        id: leadId,
        status: "ACTIVE" as const,
        statusLabel: "Active",
        pipelineStageId: restoredStage.id,
        changed: true,
      },
    };
  });
}

async function recordLifecycleStatusAudit(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  leadId: string,
  previousStatus: string | null,
  nextStatus: string,
  previousStageId: string | null,
  nextStageId: string | null,
  ipAddress?: string,
) {
  await tx.audit_logs.create({
    data: {
      user_id: actor.id,
      entity_type: "lead",
      entity_id: leadId,
      action: "lead_status_changed",
      ip_address: ipAddress,
      old_data: { status: previousStatus, pipelineStageId: previousStageId },
      new_data: { status: nextStatus, pipelineStageId: nextStageId },
    },
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
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${`lead-assignment:${leadId}`}))
    `);
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
              ...(institutionProgramId
                ? { role_institution_programs: { some: { institution_program_id: institutionProgramId } } }
                : {}),
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
    const assignment = await tx.lead_assignments.create({
      data: {
        lead_id: leadId,
        assigned_to: assignee.id,
        assigned_by: actor.id,
        department_id: departmentId,
        is_main_owner: true,
      },
      select: { id: true },
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
      data: { id: leadId, assigneeId: assignee.id, assignmentId: assignment.id },
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
      status: true,
      assigned_to: true,
    },
  });
}
