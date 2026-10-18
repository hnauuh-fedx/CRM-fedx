import { randomUUID } from "node:crypto";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { isEnrolledStudent } from "./student-membership";

export async function changeStudentMembership(user: AuthUser, leadId: string, target: "student" | "candidate", programId?: string, ipAddress?: string) {
  const permissions = new Set(user.permissions);
  if (!permissions.has(target === "student" ? "student.convert_from_lead" : "student.revert_to_candidate") ||
      (target === "candidate" && !["student.view", "student.view_all"].some((p) => permissions.has(p)))) {
    return { ok: false as const, reason: "forbidden" };
  }
  return prisma.$transaction(async (tx) => {
    // Serialize conversions on the original record; never mutate its pipeline or lifecycle status.
    const visible = await tx.leads.findFirst({
      where: { id: leadId, deleted_at: null, ...getLeadScopeWhere(user, programId), ...(programId ? { institution_program_id: programId } : {}) },
      select: { id: true, institution_program_id: true, major_id: true, pipeline_stage_id: true },
    });
    if (!visible) return { ok: false as const, reason: "not_found" };
    await tx.$queryRaw`SELECT id FROM leads WHERE id = ${leadId}::uuid FOR UPDATE`;
    const existing = await tx.students.findUnique({ where: { lead_id: leadId }, select: { id: true, status: true } });
    if (isEnrolledStudent(existing) === (target === "student")) return { ok: false as const, reason: "already_in_target" };
    const previousAdmission = await tx.admission_profiles.findUnique({ where: { lead_id: leadId }, select: { admission_status_id: true } });
    if (target === "student") {
      // The explicit conversion confirms enrolment and ensures an admission profile exists.
      const profile = await tx.admission_profiles.upsert({
        where: { lead_id: leadId }, update: {},
        create: { lead_id: leadId, institution_program_id: visible.institution_program_id, major_id: visible.major_id },
        select: { id: true, institution_program_id: true, major_id: true },
      });
      await tx.students.upsert({
        where: { lead_id: leadId }, update: { status: "active", enrolled_at: new Date() },
        create: { student_code: `SV-${randomUUID()}`, lead_id: leadId, admission_profile_id: profile.id,
          institution_program_id: profile.institution_program_id ?? visible.institution_program_id,
          major_id: profile.major_id ?? visible.major_id, status: "active" },
      });
      const enrolled = await tx.admission_statuses.upsert({ where: { code: "ENROLLED" }, update: {},
        create: { code: "ENROLLED", name: "Đã nhập học", color: "#16A34A" }, select: { id: true } });
      await tx.admission_profiles.update({ where: { id: profile.id }, data: { admission_status_id: enrolled.id, updated_at: new Date() } });
    } else {
      await tx.students.update({ where: { lead_id: leadId }, data: { status: "candidate" } });
      const lastConversion = await tx.audit_logs.findFirst({ where: { entity_type: "lead", entity_id: leadId, action: "convert_to_student" },
        orderBy: [{ created_at: "desc" }, { id: "desc" }], select: { old_data: true } });
      const oldData = lastConversion?.old_data;
      const previousStatus = oldData && typeof oldData === "object" && !Array.isArray(oldData) && typeof oldData.admissionStatusId === "string"
        ? oldData.admissionStatusId : null;
      await tx.admission_profiles.updateMany({ where: { lead_id: leadId }, data: { admission_status_id: previousStatus, updated_at: new Date() } });
    }
    const action = target === "student" ? "convert_to_student" : "revert_to_candidate";
    await tx.lead_activities.create({ data: { lead_id: leadId, user_id: user.id, type: action,
      content: target === "student" ? "Chuyển sang học viên. Giữ nguyên tiến trình." : "Chuyển trở lại ứng viên. Giữ nguyên tiến trình." } });
    await tx.audit_logs.create({ data: { user_id: user.id, entity_type: "lead", entity_id: leadId, action,
      old_data: { recordType: target === "student" ? "candidate" : "student", admissionStatusId: previousAdmission?.admission_status_id ?? null },
      new_data: { recordType: target, pipelineStageId: visible.pipeline_stage_id }, ip_address: ipAddress } });
    await tx.notifications.create({ data: { user_id: user.id, title: target === "student" ? "Đã chuyển sang học viên" : "Đã chuyển trở lại ứng viên",
      content: "Thông tin và tiến trình của hồ sơ được giữ nguyên.", type: action } });
    return { ok: true as const, data: { id: leadId, recordType: target } };
  });
}
