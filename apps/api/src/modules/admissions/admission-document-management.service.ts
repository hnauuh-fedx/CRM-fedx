import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../database/prisma";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type AdmissionDocumentInput = {
  leadId: string;
  documentType: string;
  fileName?: string;
  fileUrl?: string;
  mimeType?: string;
  fileSize?: number;
};

export type AdmissionDocumentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "missing"
  | "supplement_requested";

const emptyToNull = (value?: string) => value?.trim() || null;

function getStatusContent(status: AdmissionDocumentStatus) {
  const labels: Record<AdmissionDocumentStatus, string> = {
    approved: "Duyệt tài liệu hồ sơ.",
    missing: "Đánh dấu thiếu tài liệu hồ sơ.",
    pending: "Chuyển tài liệu hồ sơ về trạng thái chờ duyệt.",
    rejected: "Từ chối tài liệu hồ sơ.",
    supplement_requested: "Yêu cầu bổ sung tài liệu hồ sơ.",
  };
  return labels[status];
}

function getStatusNotification(status: AdmissionDocumentStatus) {
  if (status === "missing") {
    return {
      title: "Hồ sơ thiếu tài liệu",
      content: "Một tài liệu hồ sơ đã được đánh dấu thiếu và cần theo dõi bổ sung.",
      type: "admission_document_missing",
    };
  }
  if (status === "supplement_requested") {
    return {
      title: "Cần bổ sung tài liệu hồ sơ",
      content: "Một tài liệu hồ sơ cần được bổ sung hoặc thay thế.",
      type: "admission_document_supplement",
    };
  }
  return null;
}

async function findVisibleProfileByLead(tx: TransactionClient, leadId: string, scopedProgramId?: string) {
  return tx.admission_profiles.findFirst({
    where: {
      lead_id: leadId,
      ...(scopedProgramId ? { institution_program_id: scopedProgramId } : {}),
    },
    select: {
      id: true,
      lead_id: true,
      admission_code: true,
      leads: { select: { id: true, full_name: true, assigned_to: true } },
    },
  });
}

async function findVisibleDocument(documentId: string, scopedProgramId?: string) {
  return prisma.admission_documents.findFirst({
    where: {
      id: documentId,
      ...(scopedProgramId
        ? { leads: { is: { admission_profiles: { is: { institution_program_id: scopedProgramId } } } } }
        : {}),
    },
    select: {
      id: true,
      lead_id: true,
      document_type: true,
      file_id: true,
      status: true,
      files: { select: { id: true, file_name: true } },
      leads: {
        select: {
          id: true,
          full_name: true,
          assigned_to: true,
          admission_profiles: { select: { id: true, admission_code: true, institution_program_id: true } },
        },
      },
    },
  });
}

export async function getAdmissionDocumentActionOptions(scopedProgramId?: string) {
  const [profiles, types] = await prisma.$transaction([
    prisma.admission_profiles.findMany({
      where: scopedProgramId ? { institution_program_id: scopedProgramId } : undefined,
      select: {
        lead_id: true,
        admission_code: true,
        leads: { select: { full_name: true, lead_code: true } },
      },
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      take: 300,
    }),
    prisma.admission_documents.findMany({
      select: { document_type: true },
      distinct: ["document_type"],
      orderBy: { document_type: "asc" },
      take: 200,
    }),
  ]);

  return {
    profiles: profiles.flatMap((profile) =>
      profile.lead_id && profile.leads
        ? [{
            leadId: profile.lead_id,
            admissionCode: profile.admission_code,
            candidateName: profile.leads.full_name,
            leadCode: profile.leads.lead_code,
          }]
        : [],
    ),
    statuses: ["pending", "approved", "rejected", "missing", "supplement_requested"],
    types: types.map((item) => item.document_type),
  };
}

export async function uploadAdmissionDocument(
  user: AuthUser,
  input: AdmissionDocumentInput,
  ipAddress?: string,
  scopedProgramId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const profile = await findVisibleProfileByLead(tx, input.leadId, scopedProgramId);
    if (!profile || !profile.leads) {
      return { ok: false as const, reason: "profile_not_found" as const };
    }

    const hasFile = Boolean(input.fileName?.trim() && input.fileUrl?.trim());
    const file = hasFile
      ? await tx.files.create({
          data: {
            file_name: input.fileName!.trim(),
            file_url: input.fileUrl!.trim(),
            mime_type: emptyToNull(input.mimeType),
            file_size: input.fileSize ? BigInt(input.fileSize) : null,
            uploaded_by: user.id,
          },
          select: { id: true, file_name: true },
        })
      : null;

    const document = await tx.admission_documents.create({
      data: {
        lead_id: input.leadId,
        document_type: input.documentType.trim(),
        file_id: file?.id ?? null,
        status: file ? "pending" : "missing",
        uploaded_at: new Date(),
      },
      select: { id: true, status: true },
    });
    if (file) {
      await tx.file_relations.create({
        data: { file_id: file.id, entity_type: "admission_document", entity_id: document.id },
      });
    }
    await tx.lead_activities.create({
      data: {
        lead_id: input.leadId,
        user_id: user.id,
        type: file ? "admission_document_uploaded" : "admission_document_missing",
        content: file
          ? `Tải lên tài liệu ${input.documentType.trim()}.`
          : `Đánh dấu thiếu tài liệu ${input.documentType.trim()}.`,
        metadata: { documentId: document.id, fileId: file?.id ?? null },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_document",
        entity_id: document.id,
        action: file ? "upload" : "mark_missing",
        new_data: {
          leadId: input.leadId,
          documentType: input.documentType.trim(),
          fileId: file?.id ?? null,
          status: document.status,
        },
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: document.id } };
  });
}

export async function updateAdmissionDocumentStatus(
  user: AuthUser,
  documentId: string,
  status: AdmissionDocumentStatus,
  note?: string,
  ipAddress?: string,
  scopedProgramId?: string,
) {
  const existing = await findVisibleDocument(documentId, scopedProgramId);
  if (!existing) {
    return { ok: false as const, reason: "document_not_found" as const };
  }

  return prisma.$transaction(async (tx) => {
    await tx.admission_documents.update({
      where: { id: documentId },
      data: { status, uploaded_at: status === "pending" ? new Date() : existing.status === "missing" ? new Date() : undefined },
    });
    await tx.lead_activities.create({
      data: {
        lead_id: existing.lead_id,
        user_id: user.id,
        type: "admission_document_status_changed",
        content: getStatusContent(status),
        metadata: { documentId, fromStatus: existing.status, toStatus: status, note: emptyToNull(note) },
      },
    });
    const notification = getStatusNotification(status);
    if (notification && existing.leads?.assigned_to) {
      await tx.notifications.create({
        data: {
          user_id: existing.leads.assigned_to,
          title: notification.title,
          content: `${notification.content} Thí sinh: ${existing.leads.full_name}.`,
          type: notification.type,
        },
      });
    }
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_document",
        entity_id: documentId,
        action: `status_${status}`,
        old_data: { status: existing.status },
        new_data: { status, note: emptyToNull(note) },
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: documentId, status } };
  });
}
