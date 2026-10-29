import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { PrivateFileError } from "./file-validation";
import { enrolledStudentWhere } from "../students/student-membership";

export type UploadTarget = { domain: "lead" | "admission"; leadId: string; programId: string; documentType?: string };
export async function assertFileTarget(actor: AuthUser, target: UploadTarget, write: boolean, db: Pick<Prisma.TransactionClient, "leads" | "admission_profiles" | "students"> = prisma) {
  if (write && actor.accessScope === "READ_ONLY") throw new PrivateFileError(403, "Tài khoản chỉ được xem dữ liệu.");
  if (!actor.institutionProgramIds.includes(target.programId)) throw new PrivateFileError(403, "Bạn không được truy cập chương trình này.");
  if (target.domain === "admission") {
    if (!actor.permissions.some(p => ["admission.view", "admission.view_all", "admission_document.view", "admission_document.upload"].includes(p)) || !(write ? actor.permissions.includes("admission_document.upload") : actor.permissions.some(p => ["document.sensitive.view", "admission_document.upload", "admission.approve"].includes(p)))) throw new PrivateFileError(403, "Bạn chưa có quyền truy cập tài liệu tuyển sinh.");
    // Admission currently exposes program scope; never fall back to an unscoped lead lookup.
    const profile = await db.admission_profiles.findFirst({ where: { lead_id: target.leadId, institution_program_id: target.programId, leads: { is: { deleted_at: null, institution_program_id: target.programId } } }, select: { id: true } });
    if (!profile) throw new PrivateFileError(404, "Không tìm thấy hồ sơ trong phạm vi của bạn.");
  } else {
    if (!actor.permissions.some(p => ["lead.view", "lead.view_all", "lead.view_department", "lead.view_assigned"].includes(p)) || write && !actor.permissions.includes("file.upload")) throw new PrivateFileError(403, "Bạn chưa có quyền truy cập tệp đính kèm.");
    const lead = await db.leads.findFirst({ where: { AND: [{ id: target.leadId, deleted_at: null, institution_program_id: target.programId }, getLeadScopeWhere(actor, target.programId)] }, select: { id: true } });
    if (!lead) throw new PrivateFileError(404, "Không tìm thấy hồ sơ trong phạm vi của bạn.");
    const student = await db.students.findFirst({ where: { lead_id: target.leadId, ...enrolledStudentWhere }, select: { id: true } });
    if (student && (!actor.permissions.some(p => ["student.view", "student.view_all"].includes(p)) || write && !actor.permissions.some(p => ["student.update", "student.update_all"].includes(p)))) throw new PrivateFileError(403, "Bạn chưa có quyền truy cập tệp của học viên.");
  }
}
