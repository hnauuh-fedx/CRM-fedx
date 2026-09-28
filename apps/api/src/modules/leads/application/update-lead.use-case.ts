import { prisma } from "../../../database/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import {
  hasValidAdmissionReferences,
  saveAdmissionProfile,
} from "../../admissions/admission-profile-write.service";
import type { AuthUser } from "../../auth/auth.types";
import { triggerAutomation } from "../../automations/automation-engine.service";
import { saveLeadAttributionAndTags } from "../../campaigns/lead-attribution.service";
import { saveCandidateProfile } from "../../students/candidate-profile.service";
import type { LeadInput } from "../domain/lead-input";
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
  recordStageChange,
  selectAssigneeDepartment,
  toLeadData,
} from "./lead-mutation-support";

function optionalInboundText(value: string | undefined) {
  return value?.trim() || null;
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
  const [oldLead, oldStudentProfile, oldAdmissionProfile, oldTracking] =
    await Promise.all([
      tx.leads.findUniqueOrThrow({
        where: { id: leadId },
        select: {
          full_name: true,
          phone: true,
          email: true,
          source_id: true,
          origin_id: true,
          note: true,
          date_of_birth: true,
        },
      }),
      tx.student_profiles.findUnique({
        where: { lead_id: leadId },
        select: { company_name: true, graduation_year: true },
      }),
      tx.admission_profiles.findUnique({
        where: { lead_id: leadId },
        select: { monthly_revenue: true, decision_signed_date: true },
      }),
      tx.utm_trackings.findFirst({
        where: { lead_id: leadId },
        select: { gclid: true },
      }),
    ]);

  const data: Prisma.leadsUncheckedUpdateInput = { updated_at: new Date() };
  if (providedFields.has("fullName")) data.full_name = input.fullName.trim();
  if (providedFields.has("phone")) data.phone = input.phone.trim();
  if (providedFields.has("email")) data.email = optionalInboundText(input.email);
  if (providedFields.has("sourceId")) data.source_id = input.sourceId;
  if (providedFields.has("originId")) data.origin_id = input.originId;
  if (providedFields.has("note")) data.note = optionalInboundText(input.note);
  if (providedFields.has("dateOfBirth")) {
    data.date_of_birth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
  }
  const updatedLead = await tx.leads.update({
    where: { id: leadId },
    data,
    select: {
      full_name: true,
      phone: true,
      email: true,
      source_id: true,
      origin_id: true,
      note: true,
      date_of_birth: true,
    },
  });

  if (providedFields.has("companyName") || providedFields.has("graduationYear")) {
    const profileData: {
      updated_at: Date;
      company_name?: string | null;
      graduation_year?: number | null;
    } = { updated_at: new Date() };
    if (providedFields.has("companyName")) {
      profileData.company_name = optionalInboundText(input.companyName);
    }
    if (providedFields.has("graduationYear")) {
      profileData.graduation_year = input.graduationYear
        ? Number(input.graduationYear)
        : null;
    }
    await tx.student_profiles.upsert({
      where: { lead_id: leadId },
      create: { lead_id: leadId, ...profileData },
      update: profileData,
    });
  }

  if (
    providedFields.has("monthlyRevenue") ||
    providedFields.has("decisionSignedDate")
  ) {
    const admissionData: {
      updated_at: Date;
      monthly_revenue?: string;
      decision_signed_date?: Date | null;
    } = { updated_at: new Date() };
    if (providedFields.has("monthlyRevenue")) {
      admissionData.monthly_revenue = input.monthlyRevenue ?? "0";
    }
    if (providedFields.has("decisionSignedDate")) {
      admissionData.decision_signed_date = input.decisionSignedDate
        ? new Date(input.decisionSignedDate)
        : null;
    }
    await tx.admission_profiles.upsert({
      where: { lead_id: leadId },
      create: {
        lead_id: leadId,
        institution_program_id: institutionProgramId,
        ...admissionData,
      },
      update: admissionData,
    });
  }

  if (providedFields.has("gclid")) {
    const tracking = await tx.utm_trackings.findFirst({
      where: { lead_id: leadId },
      select: { id: true },
    });
    if (tracking) {
      await tx.utm_trackings.update({
        where: { id: tracking.id },
        data: { gclid: optionalInboundText(input.gclid) },
      });
    } else if (input.gclid?.trim()) {
      await tx.utm_trackings.create({
        data: { lead_id: leadId, gclid: input.gclid.trim() },
      });
    }
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

  const [newStudentProfile, newAdmissionProfile, newTracking] =
    await Promise.all([
      tx.student_profiles.findUnique({
        where: { lead_id: leadId },
        select: { company_name: true, graduation_year: true },
      }),
      tx.admission_profiles.findUnique({
        where: { lead_id: leadId },
        select: { monthly_revenue: true, decision_signed_date: true },
      }),
      tx.utm_trackings.findFirst({
        where: { lead_id: leadId },
        select: { gclid: true },
      }),
    ]);
  await tx.lead_activities.create({
    data: {
      lead_id: leadId,
      user_id: actor.id,
      type: "lead_updated",
      content: "Cập nhật Lead từ inbound webhook.",
    },
  });
  await tx.audit_logs.create({
    data: {
      user_id: actor.id,
      entity_type: "lead",
      entity_id: leadId,
      action: "webhook_update",
      ip_address: ipAddress,
      old_data: {
        lead: {
          ...oldLead,
          date_of_birth: oldLead.date_of_birth?.toISOString() ?? null,
        },
        studentProfile: oldStudentProfile,
        admissionProfile: oldAdmissionProfile
          ? {
              ...oldAdmissionProfile,
              decision_signed_date:
                oldAdmissionProfile.decision_signed_date?.toISOString() ?? null,
            }
          : null,
        tracking: oldTracking,
      },
      new_data: {
        lead: {
          ...updatedLead,
          date_of_birth: updatedLead.date_of_birth?.toISOString() ?? null,
        },
        studentProfile: newStudentProfile,
        admissionProfile: newAdmissionProfile
          ? {
              ...newAdmissionProfile,
              decision_signed_date:
                newAdmissionProfile.decision_signed_date?.toISOString() ?? null,
            }
          : null,
        tracking: newTracking,
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
    const existing = await findVisibleLeadForMutation(
      actor,
      leadId,
      institutionProgramId,
      tx,
    );
    if (!existing) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }
    const duplicate = await tx.leads.findFirst({
      where: {
        phone: input.phone.trim(),
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
      select: { id: true },
    });
    if (!source) {
      return { ok: false as const, reason: "source_not_found" as const };
    }
    if (!(await hasValidAdmissionReferences(tx, input, leadId))) {
      return {
        ok: false as const,
        reason: "admission_reference_not_found" as const,
      };
    }

    const hasStageSelection = input.pipelineStageId !== undefined;
    const selectedStage = await getSelectedStage(tx, input.pipelineStageId);
    if (input.pipelineStageId && !selectedStage) {
      return { ok: false as const, reason: "stage_not_found" as const };
    }
    const nextStageId = selectedStage?.id ?? null;
    const assignmentChanged =
      input.assigneeId !== undefined &&
      input.assigneeId !== existing.assigned_to;
    if (assignmentChanged && !canAssignLead(actor)) {
      return { ok: false as const, reason: "assignment_forbidden" as const };
    }
    const nextAssignee =
      assignmentChanged && input.assigneeId
        ? await findActiveAssignableSale(tx, input.assigneeId)
        : null;
    if (
      assignmentChanged &&
      input.assigneeId &&
      (!nextAssignee ||
        !isAssigneeInScope(actor, nextAssignee.user_departments))
    ) {
      return { ok: false as const, reason: "assignee_not_telesale" as const };
    }

    await tx.leads.update({
      where: { id: leadId },
      data: {
        ...toLeadData(input),
        ...(hasStageSelection ? { pipeline_stage_id: nextStageId } : {}),
        ...(assignmentChanged ? { assigned_to: nextAssignee?.id ?? null } : {}),
        updated_at: new Date(),
      },
    });
    await saveCandidateProfile(tx, leadId, input);
    await saveAdmissionProfile(tx, leadId, input);
    await saveLeadAttributionAndTags(tx, leadId, input);
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
        { ipAddress },
      );
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
        await tx.notifications.create({
          data: {
            user_id: nextAssignee.id,
            title: "Bạn được phân công lead mới",
            content: `Lead ${input.fullName.trim()} đã được phân công cho bạn.`,
            type: "lead_assignment",
          },
        });
      } else {
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

    return {
      ok: true as const,
      data: {
        id: leadId,
        assignmentEvent: assignmentChanged
          ? nextAssignee
            ? ("lead_assigned" as const)
            : ("lead_unassigned" as const)
          : null,
      },
    };
  });

  if (result.ok && result.data.assignmentEvent) {
    triggerAutomation(result.data.assignmentEvent, {
      leadId: result.data.id,
      actorId: actor.id,
      institutionProgramId: institutionProgramId ?? undefined,
    }).catch(console.error);
  }
  return result;
}
