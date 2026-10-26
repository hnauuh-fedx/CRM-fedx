import { prisma } from "../../../database/prisma";
import { Prisma } from "../../../generated/prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { getLeadScopeWhere } from "../lead-list.service";
import { getLeadWritableFields, updateLeadInformationInTransaction } from "../lead-information-update.service";
import { canUpdateLead } from "./lead-authorization";
import { addLeadNote } from "./lead-collaboration.use-cases";
import { changeLeadStage } from "./lead-owner-stage.commands";

export const bulkUpdatableLeadFields = ["pipelineStageId", "sourceId", "originId", "monthlyRevenue", "note"] as const;
export type BulkUpdatableLeadField = typeof bulkUpdatableLeadFields[number];
export type LeadBulkUpdate = { field: BulkUpdatableLeadField; value: string };

type InformationField = Extract<BulkUpdatableLeadField, "sourceId" | "originId" | "monthlyRevenue">;
const informationFieldLabels: Record<InformationField, string> = {
  sourceId: "Nguồn học viên",
  originId: "Nhóm nguồn",
  monthlyRevenue: "Doanh số tháng",
};
const stageFailureMessages = {
  lead_not_found: "Lead không còn trong phạm vi truy cập.",
  stage_not_found: "Tiến trình đã chọn không tồn tại.",
  lead_failed: "Lead đang ở trạng thái Fail. Hãy chuyển về Active trước khi đổi tiến trình.",
  note_template_invalid: "Mẫu ghi chú chuyển tiến trình không hợp lệ.",
  permission_denied: "Bạn không có quyền cập nhật tiến trình.",
} as const;

export type BulkUpdateFailure = { leadId: string; fullName: string; leadCode: string | null; message: string };

export function canBulkUpdateLeadField(actor: AuthUser, field: BulkUpdatableLeadField) {
  return field === "note" ? actor.permissions.includes("lead_note.create") || canUpdateLead(actor) : canUpdateLead(actor);
}

/** Options for the bulk-update dialog, resolved with the same rules as single-lead information updates. */
export async function getBulkUpdateFieldOptions(actor: AuthUser, institutionProgramId?: string) {
  const fields = new Map((await getLeadWritableFields(actor, institutionProgramId ?? null)).map((field) => [field.key, field]));
  const describe = (key: InformationField) => {
    const field = fields.get(key);
    return {
      options: (field?.options ?? []).map((option) => ({ id: option.code, name: option.label })),
      readOnlyReason: field ? field.readOnlyReason ?? null : "Bạn không có quyền cập nhật trường này.",
    };
  };
  return { sourceId: describe("sourceId"), originId: describe("originId"), monthlyRevenue: describe("monthlyRevenue") };
}

/**
 * Applies one field to many leads through the same per-lead commands used on the lead detail screen,
 * so history, notes, automation triggers and audit records stay identical to manual edits.
 */
export async function bulkUpdateLeads(
  actor: AuthUser,
  leadIds: string[],
  update: LeadBulkUpdate,
  institutionProgramId?: string,
  ipAddress?: string,
) {
  if (!canBulkUpdateLeadField(actor, update.field) || actor.accessScope === "READ_ONLY") {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  const uniqueLeadIds = [...new Set(leadIds)];
  const leads = await prisma.leads.findMany({
    where: {
      id: { in: uniqueLeadIds },
      deleted_at: null,
      ...getLeadScopeWhere(actor, institutionProgramId),
      ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
    },
    select: { id: true, full_name: true, lead_code: true },
  });
  if (leads.length !== uniqueLeadIds.length) return { ok: false as const, reason: "lead_not_found" as const };
  if (update.field === "pipelineStageId") {
    const stage = await prisma.pipeline_stages.findUnique({ where: { id: update.value }, select: { id: true } });
    if (!stage) return { ok: false as const, reason: "stage_not_found" as const };
  }

  let updatedCount = 0;
  let unchangedCount = 0;
  const failures: BulkUpdateFailure[] = [];
  const fail = (lead: typeof leads[number], message: string) =>
    failures.push({ leadId: lead.id, fullName: lead.full_name, leadCode: lead.lead_code, message });

  // Leads are processed one by one so a single locked or failed lead does not roll back the whole batch.
  for (const lead of [...leads].sort((left, right) => left.id.localeCompare(right.id))) {
    try {
      if (update.field === "pipelineStageId") {
        const result = await changeLeadStage(actor, lead.id, update.value, institutionProgramId, ipAddress);
        if (!result.ok) fail(lead, stageFailureMessages[result.reason]);
        else if (result.data.changed) updatedCount += 1;
        else unchangedCount += 1;
      } else if (update.field === "note") {
        const result = await addLeadNote(actor, lead.id, update.value, institutionProgramId, ipAddress);
        if (!result.ok) fail(lead, result.reason === "lead_not_found" ? stageFailureMessages.lead_not_found : "Bạn không có quyền thêm ghi chú.");
        else updatedCount += 1;
      } else {
        const label = informationFieldLabels[update.field];
        const { changedFields } = await prisma.$transaction((tx) => updateLeadInformationInTransaction(
          tx,
          actor,
          lead.id,
          [{ field: `system:${update.field}`, operation: "set", value: update.value }],
          institutionProgramId,
          { activityContent: () => `Cập nhật hàng loạt ${label}.`, auditAction: "bulk_update_information", ipAddress },
        ));
        if (changedFields.length) updatedCount += 1;
        else unchangedCount += 1;
      }
    } catch (error) {
      // Business rule errors carry user-facing Vietnamese messages; database errors must not leak details.
      const isDatabaseError = error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError;
      if (!(error instanceof Error) || isDatabaseError) console.error(error);
      fail(lead, error instanceof Error && !isDatabaseError ? error.message : "Không thể cập nhật lead này. Vui lòng thử lại.");
    }
  }

  return {
    ok: true as const,
    data: { field: update.field, totalCount: leads.length, updatedCount, unchangedCount, failedCount: failures.length, failures },
  };
}
