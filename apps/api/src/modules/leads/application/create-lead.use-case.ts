import { prisma } from "../../../database/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import {
  hasValidAdmissionReferences,
  saveAdmissionProfile,
} from "../../admissions/admission-profile-write.service";
import { triggerAutomation } from "../../automations/automation-engine.service";
import { saveLeadAttributionAndTags } from "../../campaigns/lead-attribution.service";
import { saveCandidateProfile } from "../../students/candidate-profile.service";
import type { AuthUser } from "../../auth/auth.types";
import type { LeadInput } from "../domain/lead-input";
import {
  canAssignLead,
  canCreateLead,
  isAssigneeInScope,
} from "./lead-authorization";
import {
  findActiveAssignableSale,
  getSelectedStage,
  recordStageChange,
  selectAssigneeDepartment,
  toLeadData,
} from "./lead-mutation-support";

export type CreateLeadOptions = {
  allowDuplicate?: boolean;
  allowMissingSource?: boolean;
  ipAddress?: string;
};

type PersistLeadOptions = CreateLeadOptions & {
  skipAuthorization?: boolean;
};

async function persistLeadInTransaction(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  input: LeadInput,
  options: PersistLeadOptions = {},
) {
  if (!options.skipAuthorization && !canCreateLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  if (!options.skipAuthorization && input.assigneeId && !canAssignLead(actor)) {
    return { ok: false as const, reason: "assignment_forbidden" as const };
  }
  if (!options.allowDuplicate) {
    const duplicate = await tx.leads.findFirst({
      where: {
        phone: input.phone.trim(),
        deleted_at: null,
        ...(input.institutionProgramId
          ? { institution_program_id: input.institutionProgramId }
          : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      return { ok: false as const, reason: "phone_already_exists" as const };
    }
  }

  if (input.sourceId || !options.allowMissingSource) {
    const source = input.sourceId
      ? await tx.lead_sources.findUnique({
          where: { id: input.sourceId },
          select: { id: true },
        })
      : null;
    if (!source) {
      return { ok: false as const, reason: "source_not_found" as const };
    }
  }

  if (!(await hasValidAdmissionReferences(tx, input))) {
    return {
      ok: false as const,
      reason: "admission_reference_not_found" as const,
    };
  }

  const selectedStage = await getSelectedStage(tx, input.pipelineStageId);
  if (input.pipelineStageId && !selectedStage) {
    return { ok: false as const, reason: "stage_not_found" as const };
  }

  const assignee = input.assigneeId
    ? await findActiveAssignableSale(tx, input.assigneeId, undefined, input.institutionProgramId)
    : null;
  const assigneeInScope =
    assignee && isAssigneeInScope(actor, assignee.user_departments);
  if (
    input.assigneeId &&
    (!assignee || (!options.skipAuthorization && !assigneeInScope))
  ) {
    return { ok: false as const, reason: "assignee_not_telesale" as const };
  }

  const lead = await tx.leads.create({
    data: {
      ...toLeadData(input),
      pipeline_stage_id: selectedStage?.id ?? null,
      lead_code: `LD-${Date.now().toString(36).toUpperCase()}`,
      owner_id: actor.id,
      assigned_to: assignee?.id ?? null,
    },
    select: { id: true },
  });

  await saveCandidateProfile(tx, lead.id, input);
  await saveAdmissionProfile(tx, lead.id, input);
  await saveLeadAttributionAndTags(tx, lead.id, input);

  await tx.lead_activities.create({
    data: {
      lead_id: lead.id,
      user_id: actor.id,
      type: "lead_created",
      content: "Tạo lead mới.",
    },
  });
  await tx.audit_logs.create({
    data: {
      user_id: actor.id,
      entity_type: "lead",
      entity_id: lead.id,
      action: "create",
      ip_address: options.ipAddress,
      new_data: {
        fullName: input.fullName,
        sourceId: input.sourceId,
        assigneeId: assignee?.id ?? null,
      },
    },
  });

  if (assignee) {
    const departmentId = selectAssigneeDepartment(
      actor,
      assignee.user_departments,
    );
    await tx.lead_assignments.create({
      data: {
        lead_id: lead.id,
        assigned_to: assignee.id,
        assigned_by: actor.id,
        department_id: departmentId,
        is_main_owner: true,
      },
    });
    await tx.lead_activities.create({
      data: {
        lead_id: lead.id,
        user_id: actor.id,
        type: "lead_assigned",
        content: `Phân công lead cho ${assignee.full_name}.`,
      },
    });
    await tx.notifications.create({
      data: {
        user_id: assignee.id,
        title: "Bạn được phân công lead mới",
        content: `Lead ${input.fullName.trim()} đã được phân công cho bạn.`,
        type: "lead_assignment",
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "lead",
        entity_id: lead.id,
        action: "assign",
        ip_address: options.ipAddress,
        old_data: { assigneeId: null },
        new_data: { assigneeId: assignee.id, departmentId },
      },
    });
  }

  if (selectedStage) {
    await recordStageChange(tx, actor, lead.id, null, selectedStage);
  }

  return {
    ok: true as const,
    data: { id: lead.id, assigneeId: assignee?.id ?? null },
  };
}

export function createLeadInTransaction(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  input: LeadInput,
  options: CreateLeadOptions = {},
) {
  return persistLeadInTransaction(tx, actor, input, options);
}

export function createTrustedInboundLeadInTransaction(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  input: LeadInput,
  options: CreateLeadOptions = {},
) {
  return persistLeadInTransaction(tx, actor, input, {
    ...options,
    skipAuthorization: true,
  });
}

export function triggerLeadCreatedAutomation(
  actor: AuthUser,
  input: LeadInput,
  result: { id: string; assigneeId: string | null },
) {
  triggerAutomation("lead_created", {
    leadId: result.id,
    actorId: actor.id,
    institutionProgramId: input.institutionProgramId ?? undefined,
  }).catch(console.error);

  if (result.assigneeId) {
    triggerAutomation("lead_assigned", {
      leadId: result.id,
      actorId: actor.id,
      institutionProgramId: input.institutionProgramId ?? undefined,
    }).catch(console.error);
  }
}

export async function createLead(
  actor: AuthUser,
  input: LeadInput,
  ipAddress?: string,
) {
  if (!canCreateLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  if (
    input.assigneeId &&
    !canAssignLead(actor)
  ) {
    return { ok: false as const, reason: "assignment_forbidden" as const };
  }

  const result = await prisma.$transaction((tx) =>
    createLeadInTransaction(tx, actor, input, { ipAddress }),
  );

  if (result.ok) {
    triggerLeadCreatedAutomation(actor, input, result.data);
  }
  return result;
}
