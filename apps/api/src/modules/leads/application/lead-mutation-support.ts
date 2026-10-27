import type { AuthUser } from "../../auth/auth.types";
import { getPreference } from "../../system/system-preferences.service";
import { assertStoredLeadRequirements } from "../lead-required-fields";
import { prisma } from "../../../database/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import type { LeadInput } from "../domain/lead-input";
import { getLeadScopeWhere } from "../lead-list.service";

export async function findVisibleLeadForMutation(
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
      phone: true,
      email: true,
      gender: true,
      date_of_birth: true,
      cccd: true,
      note: true,
      source_id: true,
      temperature: true,
      status: true,
      pipeline_stage_id: true,
      assigned_to: true,
      secondary_assigned_to: true,
    },
  });
}

export function emptyToNull(value?: string) {
  return value?.trim() || null;
}

/** Secondary numbers stored separately from the primary phone, without blanks or repeats. */
export function toSecondaryPhones(input: Pick<LeadInput, "phone" | "secondaryPhones">) {
  const primary = input.phone.trim();
  const phones = (input.secondaryPhones ?? []).map((phone) => phone.trim()).filter((phone) => phone && phone !== primary);
  return [...new Set(phones)];
}

/** Matches active leads whose primary or secondary numbers overlap any submitted number. */
export function leadPhoneDuplicateWhere(input: Pick<LeadInput, "phone" | "secondaryPhones">): Prisma.leadsWhereInput {
  const phones = [input.phone.trim(), ...toSecondaryPhones(input)];
  return { OR: [{ phone: { in: phones } }, { secondary_phones: { hasSome: phones } }] };
}

export function toLeadData(input: LeadInput) {
  return {
    full_name: input.fullName.trim(),
    phone: input.phone.trim(),
    ...(input.secondaryPhones !== undefined ? { secondary_phones: toSecondaryPhones(input) } : {}),
    source_id: input.sourceId || null,
    ...(input.originId !== undefined ? { origin_id: input.originId } : {}),
    institution_program_id: input.institutionProgramId ?? null,
    major_id: input.majorId ?? null,
    email: emptyToNull(input.email),
    gender: emptyToNull(input.gender),
    date_of_birth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    cccd: emptyToNull(input.cccd),
    note: emptyToNull(input.note),
    ...(input.temperature ? { temperature: input.temperature } : {}),
  };
}

export async function getSelectedStage(
  tx: Prisma.TransactionClient,
  pipelineStageId?: string,
) {
  if (!pipelineStageId) return null;

  return tx.pipeline_stages.findUnique({
    where: { id: pipelineStageId },
    select: { id: true, name: true },
  });
}

export const assignableSaleWhere = {
  user_program_roles: {
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
};

export async function findActiveAssignableSale(
  tx: Prisma.TransactionClient,
  assigneeId: string,
  departmentId?: string,
  institutionProgramId?: string,
) {
  return tx.users.findFirst({
    where: {
      id: assigneeId,
      status: "active",
      deleted_at: null,
      ...(institutionProgramId
        ? {
            user_program_roles: {
              some: {
                institution_program_id: institutionProgramId,
                roles: {
                  ...assignableSaleWhere.user_program_roles.some.roles,
                },
              },
            },
          }
        : assignableSaleWhere),
      ...(departmentId
        ? { user_departments: { some: { department_id: departmentId } } }
        : {}),
    },
    select: {
      id: true,
      full_name: true,
      user_departments: {
        select: { department_id: true },
        orderBy: { id: "asc" as const },
      },
    },
  });
}

/**
 * A lead has one main and at most one secondary assignee. Without a main assignee the
 * secondary one is promoted, and the same person cannot hold both roles.
 */
export function normalizeLeadAssignees(primaryId?: string | null, secondaryId?: string | null) {
  let primary = primaryId || null;
  let secondary = secondaryId || null;
  if (!primary && secondary) {
    primary = secondary;
    secondary = null;
  }
  if (secondary === primary) secondary = null;
  return { primary, secondary };
}

export async function recordSecondaryAssignment(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  lead: { id: string; fullName: string },
  previousAssigneeId: string | null,
  assignee: { id: string; full_name: string } | null,
  options: { ipAddress?: string; notify?: boolean } = {},
) {
  await tx.lead_activities.create({
    data: {
      lead_id: lead.id,
      user_id: actor.id,
      type: assignee ? "lead_secondary_assigned" : "lead_secondary_unassigned",
      content: assignee
        ? `Phân công ${assignee.full_name} làm nhân viên phụ.`
        : "Gỡ nhân viên phụ khỏi lead.",
    },
  });
  await tx.audit_logs.create({
    data: {
      user_id: actor.id,
      entity_type: "lead",
      entity_id: lead.id,
      action: assignee ? "assign_secondary" : "unassign_secondary",
      ip_address: options.ipAddress,
      old_data: { secondaryAssigneeId: previousAssigneeId },
      new_data: { secondaryAssigneeId: assignee?.id ?? null },
    },
  });
  const notificationLead = assignee && options.notify !== false ? await tx.leads.findUnique({ where: { id: lead.id }, select: { institution_program_id: true } }) : null;
  if (assignee && options.notify !== false && (await getPreference(notificationLead?.institution_program_id, "notifications", tx)).assignment) {
    await tx.notifications.create({
      data: {
        user_id: assignee.id,
        title: "Bạn được phân công làm nhân viên phụ",
        content: `Lead ${lead.fullName.trim()} đã được phân công cho bạn với vai trò nhân viên phụ.`,
        type: "lead_assignment",
      },
    });
  }
}

export function selectAssigneeDepartment(
  user: AuthUser,
  memberships: Array<{ department_id: string | null }>,
  requestedDepartmentId?: string,
) {
  if (requestedDepartmentId) return requestedDepartmentId;
  return (
    memberships.find(
      (membership) =>
        membership.department_id &&
        user.departmentIds.includes(membership.department_id),
    )?.department_id ??
    memberships[0]?.department_id ??
    null
  );
}

export async function recordStageChange(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  leadId: string,
  fromStageId: string | null,
  toStage: { id: string; name: string } | null,
  options: {
    activityContent?: string;
    includeStageNameInAudit?: boolean;
    ipAddress?: string;
  } = {},
) {
  const toStageId = toStage?.id ?? null;
  if (fromStageId && toStageId && fromStageId !== toStageId) await assertStoredLeadRequirements(tx, leadId);
  await tx.lead_status_histories.create({
    data: {
      lead_id: leadId,
      from_stage_id: fromStageId,
      to_stage_id: toStageId,
      changed_by: user.id,
    },
  });
  await tx.lead_activities.create({
    data: {
      lead_id: leadId,
      user_id: user.id,
      type: "pipeline_stage_changed",
      content:
        options.activityContent ??
        (toStage
          ? `Chuyển lead sang tiến trình ${toStage.name}.`
          : "Bỏ chọn tiến trình của lead."),
      metadata: { fromStageId, toStageId },
    },
  });
  await tx.audit_logs.create({
    data: {
      user_id: user.id,
      entity_type: "lead",
      entity_id: leadId,
      action: "pipeline_stage_changed",
      ip_address: options.ipAddress,
      old_data: { pipelineStageId: fromStageId },
      new_data: {
        pipelineStageId: toStageId,
        ...(options.includeStageNameInAudit && toStage
          ? { pipelineStageName: toStage.name }
          : {}),
      },
    },
  });
}
