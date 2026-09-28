import type { AuthUser } from "../../auth/auth.types";
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
      pipeline_stage_id: true,
      assigned_to: true,
    },
  });
}

export function emptyToNull(value?: string) {
  return value?.trim() || null;
}

export function toLeadData(input: LeadInput) {
  return {
    full_name: input.fullName.trim(),
    phone: input.phone.trim(),
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
};

export async function findActiveAssignableSale(
  tx: Prisma.TransactionClient,
  assigneeId: string,
  departmentId?: string,
) {
  return tx.users.findFirst({
    where: {
      id: assigneeId,
      status: "active",
      deleted_at: null,
      ...assignableSaleWhere,
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
