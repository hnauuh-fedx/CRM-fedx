import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";

import { prisma } from "../../../database/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { createManualUnassignmentEvent, dispatchManualUnassignmentEvent } from "../../automations/manual-unassignment-event.service";
import {
  hasValidAdmissionReferences,
  patchAdmissionInformation,
  saveAdmissionProfile,
} from "../../admissions/admission-profile-write.service";
import type { AuthUser } from "../../auth/auth.types";
import { getPreference } from "../../system/system-preferences.service";
import { scheduleFirstContactSla } from "../first-contact-sla.service";
import { assertRequiredLeadInput, assertStoredLeadRequirements } from "../lead-required-fields";
import { triggerAutomation } from "../../automations/automation-engine.service";
import { patchLeadAttribution, saveLeadAttributionAndTags } from "../../campaigns/lead-attribution.service";
import { patchCandidateInformation, saveCandidateProfile } from "../../students/candidate-profile.service";
import type { LeadInput } from "../domain/lead-input";
import { isFailedLeadStatus } from "../domain/lead-lifecycle-status";
import { clearResolvedUnmatchedValues } from "../lead-unmatched-values.service";
import { recordTransitionNote, resolveTransitionNote } from "../transition-note.service";
import {
  saveSaleCustomFieldValues,
  type SaleCustomFieldInput,
} from "../sale-custom-fields.service";
import {
  canAssignLead,
  canUpdateLead,
  isAssigneeInScope,
} from "./lead-authorization";
import {
  findActiveAssignableSale,
  findVisibleLeadForMutation,
  getSelectedStage,
  leadPhoneDuplicateWhere,
  normalizeLeadAssignees,
  recordSecondaryAssignment,
  recordStageChange,
  selectAssigneeDepartment,
  toLeadData,
} from "./lead-mutation-support";

function optionalInboundText(value: string | undefined) {
  return value?.trim() || null;
}

/** Lead columns an inbound request may overwrite; other Lead form fields live in related tables. */
const inboundLeadColumns = {
  fullName: "full_name",
  phone: "phone",
  email: "email",
  sourceId: "source_id",
  originId: "origin_id",
  note: "note",
  dateOfBirth: "date_of_birth",
  gender: "gender",
  cccd: "cccd",
  majorId: "major_id",
  temperature: "temperature",
} as const;
const leadCatalogFields = new Map(
  leadFormFieldCatalog.flatMap((group) => group.fields).map((field) => [field.key, field]),
);

/** Converts a validated inbound string to the typed value the related-table writers store. */
function inboundRelatedValue(key: string, raw: string | undefined): unknown {
  const text = raw?.trim() ?? "";
  if (key === "tags") return [...new Set(text.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  if (!text) return null;
  const dataType = leadCatalogFields.get(key)?.dataType;
  if (dataType === "NUMBER") return Number(text);
  if (dataType === "DATE") return new Date(`${text.slice(0, 10)}T00:00:00.000Z`);
  return text;
}

function auditJson(value: unknown): Prisma.InputJsonValue {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return { cleared: true };
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function updateLeadFromInboundInTransaction(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  leadId: string,
  institutionProgramId: string,
  input: LeadInput,
  providedFields: Set<keyof LeadInput>,
  customFieldValues: SaleCustomFieldInput[],
  ipAddress?: string,
) {
  const leadSelect = {
    full_name: true,
    phone: true,
    email: true,
    source_id: true,
    origin_id: true,
    note: true,
    date_of_birth: true,
    gender: true,
    cccd: true,
    major_id: true,
    temperature: true,
  } as const;
  const oldLead = await tx.leads.findUniqueOrThrow({ where: { id: leadId }, select: leadSelect });

  const data: Record<string, unknown> = { updated_at: new Date() };
  for (const [key, column] of Object.entries(inboundLeadColumns)) {
    if (!providedFields.has(key as keyof LeadInput)) continue;
    const raw = input[key as keyof LeadInput] as string | undefined;
    if (key === "fullName" || key === "phone") data[column] = String(raw ?? "").trim();
    else if (key === "dateOfBirth") data[column] = raw ? new Date(raw) : null;
    else if (key === "sourceId" || key === "originId") data[column] = raw;
    else data[column] = optionalInboundText(raw);
  }
  const updatedLead = await tx.leads.update({
    where: { id: leadId },
    data: data as Prisma.leadsUncheckedUpdateInput,
    select: leadSelect,
  });

  // Fields outside `leads` are patched only when the request sent them, so omitted fields keep their values.
  const relatedValues: Record<string, unknown> = {};
  for (const key of providedFields) {
    if (!leadCatalogFields.has(key) || (key !== "majorId" && Object.hasOwn(inboundLeadColumns, key))) continue;
    relatedValues[key] = inboundRelatedValue(key, input[key] as string | undefined);
  }
  let relatedChanges: Record<string, { before: unknown; after: unknown }>;
  try {
    relatedChanges = {
      ...(await patchCandidateInformation(tx, leadId, relatedValues)),
      ...(await patchAdmissionInformation(tx, leadId, institutionProgramId, relatedValues)),
      ...(await patchLeadAttribution(tx, leadId, relatedValues)),
    };
  } catch {
    return { ok: false as const, reason: "invalid" as const };
  }

  const customResult = await saveSaleCustomFieldValues(
    tx,
    actor,
    "LEAD",
    leadId,
    institutionProgramId,
    customFieldValues,
    ipAddress,
  );
  if (!customResult.ok) return customResult;
  await assertStoredLeadRequirements(tx, leadId);

  await tx.lead_activities.create({
    data: {
      lead_id: leadId,
      user_id: actor.id,
      type: "lead_updated",
      content: "Cập nhật Lead từ inbound webhook.",
    },
  });
  const relatedAudit = (side: "before" | "after") =>
    Object.fromEntries(Object.entries(relatedChanges).map(([key, change]) => [key, auditJson(change[side])]));
  await tx.audit_logs.create({
    data: {
      user_id: actor.id,
      entity_type: "lead",
      entity_id: leadId,
      action: "webhook_update",
      ip_address: ipAddress,
      old_data: {
        lead: { ...oldLead, date_of_birth: oldLead.date_of_birth?.toISOString() ?? null },
        related: relatedAudit("before"),
      },
      new_data: {
        lead: { ...updatedLead, date_of_birth: updatedLead.date_of_birth?.toISOString() ?? null },
        related: relatedAudit("after"),
        customFieldIds: customFieldValues.map((item) => item.fieldId),
      },
    },
  });
  return { ok: true as const };
}

export async function updateLead(
  actor: AuthUser,
  leadId: string,
  input: LeadInput,
  institutionProgramId?: string,
  ipAddress?: string,
) {
  if (!canUpdateLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`lead-assignment:${leadId}`}))`);
    let manualUnassignmentEventId: string | null = null;
    const existing = await findVisibleLeadForMutation(
      actor,
      leadId,
      institutionProgramId,
      tx,
    );
    if (!existing) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }
    await assertRequiredLeadInput(tx, input);
    const duplicate = await tx.leads.findFirst({
      where: {
        ...leadPhoneDuplicateWhere(input),
        deleted_at: null,
        id: { not: leadId },
        ...(input.institutionProgramId
          ? { institution_program_id: input.institutionProgramId }
          : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      return { ok: false as const, reason: "phone_already_exists" as const };
    }
    const source = await tx.lead_sources.findUnique({
      where: { id: input.sourceId },
      select: { id: true, institution_program_id: true },
    });
    const sourceProgramId = input.institutionProgramId ?? institutionProgramId;
    if (!source || !sourceProgramId || source.institution_program_id !== sourceProgramId) {
      return { ok: false as const, reason: "source_not_found" as const };
    }
    if (!(await hasValidAdmissionReferences(tx, input))) {
      return {
        ok: false as const,
        reason: "admission_reference_not_found" as const,
      };
    }

    if (isFailedLeadStatus(existing.status) && input.pipelineStageId) {
      return { ok: false as const, reason: "lead_failed" as const };
    }
    const hasStageSelection = !isFailedLeadStatus(existing.status) && input.pipelineStageId !== undefined;
    const selectedStage = await getSelectedStage(tx, input.pipelineStageId);
    if (input.pipelineStageId && !selectedStage) {
      return { ok: false as const, reason: "stage_not_found" as const };
    }
    const nextStageId = selectedStage?.id ?? null;
    const stageChanged = hasStageSelection && existing.pipeline_stage_id !== nextStageId;
    if ((input.noteTemplateId || input.noteContent !== undefined) && (!stageChanged || !selectedStage)) {
      return { ok: false as const, reason: "note_template_invalid" as const };
    }
    const transitionNote = selectedStage && stageChanged
      ? await resolveTransitionNote(tx, selectedStage.id, selectedStage.name, input.noteTemplateId, input.noteContent)
      : { ok: true as const, content: undefined };
    if (!transitionNote.ok) return transitionNote;
    // Omitted assignee fields keep their current values before the main/secondary rules apply.
    const assignees = normalizeLeadAssignees(
      input.assigneeId !== undefined ? input.assigneeId : existing.assigned_to,
      input.secondaryAssigneeId !== undefined ? input.secondaryAssigneeId : existing.secondary_assigned_to,
    );
    const assignmentChanged = assignees.primary !== existing.assigned_to;
    const secondaryChanged = assignees.secondary !== existing.secondary_assigned_to;
    if ((assignmentChanged || secondaryChanged) && !canAssignLead(actor)) {
      return { ok: false as const, reason: "assignment_forbidden" as const };
    }
    const nextAssignee =
      assignmentChanged && assignees.primary
        ? await findActiveAssignableSale(tx, assignees.primary, undefined, input.institutionProgramId)
        : null;
    if (
      assignmentChanged &&
      assignees.primary &&
      (!nextAssignee ||
        !isAssigneeInScope(actor, nextAssignee.user_departments))
    ) {
      return { ok: false as const, reason: "assignee_not_telesale" as const };
    }
    const nextSecondaryAssignee =
      secondaryChanged && assignees.secondary
        ? await findActiveAssignableSale(tx, assignees.secondary, undefined, input.institutionProgramId)
        : null;
    if (
      secondaryChanged &&
      assignees.secondary &&
      (!nextSecondaryAssignee ||
        !isAssigneeInScope(actor, nextSecondaryAssignee.user_departments))
    ) {
      return { ok: false as const, reason: "secondary_assignee_invalid" as const };
    }

    await tx.leads.update({
      where: { id: leadId },
      data: {
        ...toLeadData(input),
        ...(hasStageSelection ? { pipeline_stage_id: nextStageId } : {}),
        ...(assignmentChanged ? { assigned_to: nextAssignee?.id ?? null, manual_unassignment_event_id: null } : {}),
        ...(secondaryChanged ? { secondary_assigned_to: nextSecondaryAssignee?.id ?? null } : {}),
        updated_at: new Date(),
      },
    });
    await saveCandidateProfile(tx, leadId, input);
    await saveAdmissionProfile(tx, leadId, input);
    await saveLeadAttributionAndTags(tx, leadId, input);
    // A value saved by the user replaces the unmatched webhook value marked with "*".
    await clearResolvedUnmatchedValues(
      tx,
      leadId,
      Object.entries(input).filter(([, value]) => typeof value === "string" && value.trim()).map(([key]) => key),
    );
    await tx.lead_activities.create({
      data: {
        lead_id: leadId,
        user_id: actor.id,
        type: "lead_updated",
        content: "Cập nhật thông tin lead.",
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "lead",
        entity_id: leadId,
        action: "update",
        ip_address: ipAddress,
        old_data: {
          fullName: existing.full_name,
          sourceId: existing.source_id,
          pipelineStageId: existing.pipeline_stage_id,
        },
        new_data: {
          fullName: input.fullName,
          sourceId: input.sourceId,
          pipelineStageId: hasStageSelection
            ? nextStageId
            : existing.pipeline_stage_id,
        },
      },
    });
    if (hasStageSelection && existing.pipeline_stage_id !== nextStageId) {
      await recordStageChange(
        tx,
        actor,
        leadId,
        existing.pipeline_stage_id,
        selectedStage,
        { ipAddress, note: transitionNote.content },
      );
      await recordTransitionNote(tx, actor, leadId, transitionNote.content, input.noteTemplateId, ipAddress);
    }

    if (assignmentChanged) {
      await tx.lead_assignments.updateMany({
        where: { lead_id: leadId, is_main_owner: true },
        data: { is_main_owner: false },
      });
      if (nextAssignee) {
        const departmentId = selectAssigneeDepartment(
          actor,
          nextAssignee.user_departments,
        );
        await tx.lead_assignments.create({
          data: {
            lead_id: leadId,
            assigned_to: nextAssignee.id,
            assigned_by: actor.id,
            department_id: departmentId,
            is_main_owner: true,
          },
        });
        await tx.lead_activities.create({
          data: {
            lead_id: leadId,
            user_id: actor.id,
            type: "lead_assigned",
            content: `Phân công lead cho ${nextAssignee.full_name}.`,
          },
        });
        await scheduleFirstContactSla(tx, leadId);
        if ((await getPreference(input.institutionProgramId ?? institutionProgramId, "notifications", tx)).assignment) await tx.notifications.create({
          data: {
            user_id: nextAssignee.id,
            title: "Bạn được phân công lead mới",
            content: `Lead ${input.fullName.trim()} đã được phân công cho bạn.`,
            type: "lead_assignment",
            lead_id: leadId,
          },
        });
      } else {
        if (existing.assigned_to) {
          const lead = await tx.leads.findUniqueOrThrow({ where: { id: leadId }, select: { institution_program_id: true } });
          manualUnassignmentEventId = await createManualUnassignmentEvent(tx, {
            leadId, actorId: actor.id, institutionProgramId: lead.institution_program_id,
          });
        }
        await tx.lead_activities.create({
          data: {
            lead_id: leadId,
            user_id: actor.id,
            type: "lead_unassigned",
            content: "Thu hồi Sale phụ trách khỏi lead.",
          },
        });
      }
      await tx.audit_logs.create({
        data: {
          user_id: actor.id,
          entity_type: "lead",
          entity_id: leadId,
          action: nextAssignee
            ? existing.assigned_to
              ? "reassign"
              : "assign"
            : "unassign",
          ip_address: ipAddress,
          old_data: { assigneeId: existing.assigned_to },
          new_data: { assigneeId: nextAssignee?.id ?? null },
        },
      });
    }

    if (secondaryChanged) {
      await recordSecondaryAssignment(
        tx,
        actor,
        { id: leadId, fullName: input.fullName },
        existing.secondary_assigned_to,
        nextSecondaryAssignee,
        { ipAddress },
      );
    }

    return {
      ok: true as const,
      data: {
        id: leadId,
        manualUnassignmentEventId,
        assignmentEvent: assignmentChanged
          ? nextAssignee
            ? ("lead_assigned" as const)
            : ("lead_unassigned" as const)
          : null,
      },
    };
  });

  if (result.ok && result.data.manualUnassignmentEventId) {
    // Persisted in the mutation transaction; worker recovery also handles API crashes.
    void dispatchManualUnassignmentEvent(result.data.manualUnassignmentEventId).catch(console.error);
  } else if (result.ok && result.data.assignmentEvent === "lead_assigned") {
    triggerAutomation(result.data.assignmentEvent, {
      leadId: result.data.id,
      actorId: actor.id,
      institutionProgramId: institutionProgramId ?? undefined,
    }).catch(console.error);
  }
  return result;
}
