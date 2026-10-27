import { createLeadCreationSnapshot, type LeadCreationSource } from "../lead-creation-history";
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
import { createFailedLeadStatus } from "../domain/lead-lifecycle-status";
import {
  canAssignLead,
  canCreateLead,
  isAssigneeInScope,
} from "./lead-authorization";
import {
  findActiveAssignableSale,
  getSelectedStage,
  leadPhoneDuplicateWhere,
  normalizeLeadAssignees,
  recordSecondaryAssignment,
  recordStageChange,
  selectAssigneeDepartment,
  toLeadData,
} from "./lead-mutation-support";

export type CreateLeadOptions = {
  creationSource?: LeadCreationSource;
  allowDuplicate?: boolean;
  allowMissingSource?: boolean;
  ipAddress?: string;
  importInitialization?: { createdAt?: Date; lifecycleStatus?: "FAIL" };
};

type PersistLeadOptions = CreateLeadOptions & {
  skipAuthorization?: boolean;
};

async function persistLeadInTransaction(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  rawInput: LeadInput,
  options: PersistLeadOptions = {},
) {
  const assignees = normalizeLeadAssignees(rawInput.assigneeId, rawInput.secondaryAssigneeId);
  const input: LeadInput = { ...rawInput, assigneeId: assignees.primary, secondaryAssigneeId: assignees.secondary };
  if (!options.skipAuthorization && !canCreateLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  if (!options.skipAuthorization && (input.assigneeId || input.secondaryAssigneeId) && !canAssignLead(actor)) {
    return { ok: false as const, reason: "assignment_forbidden" as const };
  }
  if (!options.allowDuplicate) {
    const duplicate = await tx.leads.findFirst({
      where: {
        ...leadPhoneDuplicateWhere(input),
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

  let sourceName: string | undefined;
  if (input.sourceId || !options.allowMissingSource) {
    const source = input.sourceId
      ? await tx.lead_sources.findUnique({
          where: { id: input.sourceId },
          select: { id: true, name: true, institution_program_id: true },
        })
      : null;
    if (!source || !input.institutionProgramId || source.institution_program_id !== input.institutionProgramId) {
      return { ok: false as const, reason: "source_not_found" as const };
    }
    sourceName = source.name;
  }

  if (!(await hasValidAdmissionReferences(tx, input))) {
    return {
      ok: false as const,
      reason: "admission_reference_not_found" as const,
    };
  }

  const selectedStage = await getSelectedStage(tx, input.pipelineStageId);
  if ((input.pipelineStageId || options.importInitialization?.lifecycleStatus === "FAIL") && !selectedStage) {
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
  const secondaryAssignee = input.secondaryAssigneeId
    ? await findActiveAssignableSale(tx, input.secondaryAssigneeId, undefined, input.institutionProgramId)
    : null;
  if (
    input.secondaryAssigneeId &&
    (!secondaryAssignee || (!options.skipAuthorization && !isAssigneeInScope(actor, secondaryAssignee.user_departments)))
  ) {
    return { ok: false as const, reason: "secondary_assignee_invalid" as const };
  }

  const lead = await tx.leads.create({
    data: {
      ...toLeadData(input),
      pipeline_stage_id: selectedStage?.id ?? null,
      lead_code: `LD-${Date.now().toString(36).toUpperCase()}`,
      owner_id: actor.id,
      assigned_to: assignee?.id ?? null,
      secondary_assigned_to: secondaryAssignee?.id ?? null,
      ...(options.importInitialization?.lifecycleStatus === "FAIL" && selectedStage
        ? { status: createFailedLeadStatus(selectedStage.id) }
        : {}),
      ...(options.importInitialization?.createdAt
        ? { created_at: options.importInitialization.createdAt }
        : {}),
    },
    select: { id: true },
  });

  await saveCandidateProfile(tx, lead.id, input);
  await saveAdmissionProfile(tx, lead.id, input);
  await saveLeadAttributionAndTags(tx, lead.id, input);

  const creation = createLeadCreationSnapshot({ ...input, sourceName, pipelineStageName: selectedStage?.name, assigneeName: assignee?.full_name, secondaryAssigneeName: secondaryAssignee?.full_name }, options.creationSource ?? {
    channel: options.skipAuthorization ? "api" : options.importInitialization ? "import" : "manual",
  }, options.skipAuthorization ? undefined : actor.fullName);
  await tx.lead_activities.create({
    data: {
      lead_id: lead.id,
      user_id: options.skipAuthorization ? null : actor.id,
      type: "lead_created",
      content: options.skipAuthorization ? "API đã đổ dữ liệu tạo lead." : `${actor.fullName} tạo lead mới.`,
      metadata: { creation },
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
        creation,
        fullName: input.fullName,
        sourceId: input.sourceId,
        assigneeId: assignee?.id ?? null,
        secondaryAssigneeId: secondaryAssignee?.id ?? null,
      },
    },
  });

  if (assignee && !options.importInitialization) {
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
        lead_id: lead.id,
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

  // Imports initialize historical data silently, matching the main assignee behavior.
  if (secondaryAssignee && !options.importInitialization) {
    await recordSecondaryAssignment(
      tx,
      actor,
      { id: lead.id, fullName: input.fullName },
      null,
      secondaryAssignee,
      { ipAddress: options.ipAddress },
    );
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
  creationSource?: LeadCreationSource,
) {
  if (!canCreateLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  if (
    (input.assigneeId || input.secondaryAssigneeId) &&
    !canAssignLead(actor)
  ) {
    return { ok: false as const, reason: "assignment_forbidden" as const };
  }

  const result = await prisma.$transaction((tx) =>
    createLeadInTransaction(tx, actor, input, { ipAddress, creationSource }),
  );

  if (result.ok) {
    triggerLeadCreatedAutomation(actor, input, result.data);
  }
  return result;
}
