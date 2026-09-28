import { prisma } from "../../../database/prisma";
import type { AuthUser } from "../../auth/auth.types";
import type { LeadFileInput } from "../domain/lead-input";
import { canUpdateLead } from "./lead-authorization";
import {
  emptyToNull,
  findVisibleLeadForMutation,
} from "./lead-mutation-support";

export async function addLeadNote(
  actor: AuthUser,
  leadId: string,
  content: string,
  institutionProgramId?: string,
  ipAddress?: string,
) {
  if (
    !actor.permissions.includes("lead_note.create") &&
    !canUpdateLead(actor)
  ) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  return prisma.$transaction(async (tx) => {
    const lead = await findVisibleLeadForMutation(
      actor,
      leadId,
      institutionProgramId,
      tx,
    );
    if (!lead) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }
    const note = await tx.lead_notes.create({
      data: { lead_id: leadId, user_id: actor.id, content: content.trim() },
      select: { id: true },
    });
    await tx.lead_activities.create({
      data: {
        lead_id: leadId,
        user_id: actor.id,
        type: "note_created",
        content: "Thêm ghi chú chăm sóc.",
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "lead",
        entity_id: leadId,
        action: "note_created",
        ip_address: ipAddress,
        new_data: { noteId: note.id },
      },
    });
    return { ok: true as const, data: { id: note.id } };
  });
}

export async function attachLeadFile(
  actor: AuthUser,
  leadId: string,
  input: LeadFileInput,
  institutionProgramId?: string,
  ipAddress?: string,
) {
  if (!actor.permissions.includes("file.upload") && !canUpdateLead(actor)) {
    return { ok: false as const, reason: "permission_denied" as const };
  }
  return prisma.$transaction(async (tx) => {
    const lead = await findVisibleLeadForMutation(
      actor,
      leadId,
      institutionProgramId,
      tx,
    );
    if (!lead) {
      return { ok: false as const, reason: "lead_not_found" as const };
    }
    const file = await tx.files.create({
      data: {
        file_name: input.fileName.trim(),
        file_url: input.fileUrl.trim(),
        mime_type: emptyToNull(input.mimeType),
        file_size: input.fileSize ? BigInt(input.fileSize) : null,
        uploaded_by: actor.id,
      },
      select: { id: true },
    });
    await tx.file_relations.create({
      data: { file_id: file.id, entity_type: "lead", entity_id: leadId },
    });
    await tx.lead_activities.create({
      data: {
        lead_id: leadId,
        user_id: actor.id,
        type: "file_attached",
        content: `Đính kèm tệp ${input.fileName.trim()}.`,
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "lead",
        entity_id: leadId,
        action: "file_attached",
        ip_address: ipAddress,
        new_data: { fileId: file.id },
      },
    });
    return { ok: true as const, data: { id: file.id } };
  });
}
