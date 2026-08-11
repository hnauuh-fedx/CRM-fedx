import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type AdmissionProfileInput = {
  leadId: string;
  institutionProgramId?: string;
  majorId: string;
  admissionStatusId: string;
  trainingType?: string;
  classCode?: string;
  subjectGroupCode?: string;
  subjectGroupName?: string;
  score1?: string;
  score2?: string;
  score3?: string;
  admissionScore?: string;
  applicationReceivedDate?: string;
  enrollmentBatch?: string;
  trainingCode?: string;
  registrationStation?: string;
  decisionNumber?: string;
  decisionSignedDate?: string;
  monthlyRevenue?: string;
  feeStatus?: string;
  tuitionStatus?: string;
};

const emptyToNull = (value?: string) => value?.trim() || null;
const toDecimalString = (value?: string) => value?.trim() || null;
const toDate = (value?: string) => (value ? new Date(value) : null);
const flowSettingKey = "admission_status_flow";

function canUseProgram(_user: AuthUser, profileProgramId: string | null, scopedProgramId?: string) {
  if (scopedProgramId) {
    return profileProgramId === scopedProgramId;
  }
  return true;
}

async function getProfileForAction(
  user: AuthUser,
  profileId: string,
  scopedProgramId?: string,
) {
  const profile = await prisma.admission_profiles.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      lead_id: true,
      institution_program_id: true,
      major_id: true,
      admission_status_id: true,
      admission_code: true,
      training_type: true,
      fee_status: true,
      tuition_status: true,
      monthly_revenue: true,
      leads: { select: { id: true, full_name: true, assigned_to: true } },
      majors: { select: { id: true, faculty_id: true } },
      students: { select: { id: true, student_code: true } },
    },
  });
  if (!profile || !canUseProgram(user, profile.institution_program_id, scopedProgramId)) {
    return null;
  }
  return profile;
}

async function ensureReferences(
  tx: TransactionClient,
  input: AdmissionProfileInput,
  scopedProgramId?: string,
) {
  const institutionProgramId = scopedProgramId ?? input.institutionProgramId;
  if (!institutionProgramId) {
    return { ok: false as const, reason: "program_required" as const };
  }

  const [lead, program, major, status] = await Promise.all([
    tx.leads.findFirst({
      where: {
        id: input.leadId,
        deleted_at: null,
        OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }],
      },
      select: { id: true, full_name: true, institution_program_id: true },
    }),
    tx.institution_programs.findFirst({ where: { id: institutionProgramId, status: "active" }, select: { id: true } }),
    tx.majors.findFirst({
      where: {
        id: input.majorId,
        OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }],
      },
      select: { id: true },
    }),
    tx.admission_statuses.findUnique({ where: { id: input.admissionStatusId }, select: { id: true } }),
  ]);

  if (!lead) return { ok: false as const, reason: "lead_not_found" as const };
  if (!program) return { ok: false as const, reason: "program_not_found" as const };
  if (!major) return { ok: false as const, reason: "major_not_found" as const };
  if (!status) return { ok: false as const, reason: "status_not_found" as const };
  return { ok: true as const, institutionProgramId, lead };
}

function toProfileData(input: AdmissionProfileInput, institutionProgramId: string) {
  return {
    lead_id: input.leadId,
    institution_program_id: institutionProgramId,
    major_id: input.majorId,
    admission_status_id: input.admissionStatusId,
    training_type: emptyToNull(input.trainingType),
    class_code: emptyToNull(input.classCode),
    subject_group_code: emptyToNull(input.subjectGroupCode),
    subject_group_name: emptyToNull(input.subjectGroupName),
    score_1: toDecimalString(input.score1),
    score_2: toDecimalString(input.score2),
    score_3: toDecimalString(input.score3),
    admission_score: toDecimalString(input.admissionScore),
    application_received_date: toDate(input.applicationReceivedDate),
    enrollment_batch: emptyToNull(input.enrollmentBatch),
    training_code: emptyToNull(input.trainingCode),
    registration_station: emptyToNull(input.registrationStation),
    decision_number: emptyToNull(input.decisionNumber),
    decision_signed_date: toDate(input.decisionSignedDate),
    monthly_revenue: toDecimalString(input.monthlyRevenue) ?? 0,
    fee_status: emptyToNull(input.feeStatus),
    tuition_status: emptyToNull(input.tuitionStatus),
    updated_at: new Date(),
  };
}

async function writeAdmissionActivity(
  tx: TransactionClient,
  user: AuthUser,
  leadId: string | null,
  type: string,
  content: string,
  metadata?: Prisma.InputJsonValue,
) {
  if (!leadId) return;
  await tx.lead_activities.create({
    data: { lead_id: leadId, user_id: user.id, type, content, metadata },
  });
}

export async function getAdmissionActionOptions(scopedProgramId?: string) {
  const [leads, statuses, institutionPrograms, majors, classes] = await prisma.$transaction([
    prisma.leads.findMany({
      where: {
        deleted_at: null,
        admission_profiles: null,
        ...(scopedProgramId ? { OR: [{ institution_program_id: scopedProgramId }, { institution_program_id: null }] } : {}),
      },
      select: { id: true, lead_code: true, full_name: true, phone: true },
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      take: 200,
    }),
    prisma.admission_statuses.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.institution_programs.findMany({
      where: scopedProgramId ? { id: scopedProgramId, status: "active" } : { status: "active" },
      select: { id: true, name: true, institutions: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.majors.findMany({
      where: scopedProgramId ? { OR: [{ institution_program_id: scopedProgramId }, { institution_program_id: null }] } : undefined,
      select: { id: true, name: true, faculties: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.student_classes.findMany({
      select: { id: true, code: true, name: true, faculty_id: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return {
    leads: leads.map((lead) => ({ id: lead.id, leadCode: lead.lead_code, fullName: lead.full_name, phone: lead.phone })),
    statuses,
    institutionPrograms: institutionPrograms.map((program) => ({
      id: program.id,
      name: program.name,
      institutionName: program.institutions.name,
    })),
    majors: majors.map((major) => ({
      id: major.id,
      name: major.name,
      facultyId: major.faculties?.id ?? null,
      facultyName: major.faculties?.name ?? null,
    })),
    classes: classes.map((item) => ({ id: item.id, code: item.code, name: item.name, facultyId: item.faculty_id })),
  };
}

export async function createAdmissionProfile(
  user: AuthUser,
  input: AdmissionProfileInput,
  ipAddress?: string,
  scopedProgramId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const references = await ensureReferences(tx, input, scopedProgramId);
    if (!references.ok) return references;

    const existing = await tx.admission_profiles.findUnique({ where: { lead_id: input.leadId }, select: { id: true } });
    if (existing) {
      return { ok: false as const, reason: "profile_already_exists" as const };
    }

    const profile = await tx.admission_profiles.create({
      data: {
        ...toProfileData(input, references.institutionProgramId),
        admission_code: `HS-${Date.now().toString(36).toUpperCase()}`,
      },
      select: { id: true, admission_code: true },
    });
    await tx.leads.update({
      where: { id: input.leadId },
      data: { institution_program_id: references.institutionProgramId, major_id: input.majorId, updated_at: new Date() },
    });
    await writeAdmissionActivity(tx, user, input.leadId, "admission_profile_created", "Tạo hồ sơ tuyển sinh.", { profileId: profile.id });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_profile",
        entity_id: profile.id,
        action: "create",
        new_data: { leadId: input.leadId, admissionCode: profile.admission_code },
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: profile.id } };
  });
}

export async function updateAdmissionProfile(
  user: AuthUser,
  profileId: string,
  input: AdmissionProfileInput,
  ipAddress?: string,
  scopedProgramId?: string,
) {
  const existing = await getProfileForAction(user, profileId, scopedProgramId);
  if (!existing) return { ok: false as const, reason: "profile_not_found" as const };

  return prisma.$transaction(async (tx) => {
    const references = await ensureReferences(tx, input, scopedProgramId);
    if (!references.ok) return references;

    await tx.admission_profiles.update({
      where: { id: profileId },
      data: toProfileData(input, references.institutionProgramId),
    });
    await tx.leads.update({
      where: { id: input.leadId },
      data: { institution_program_id: references.institutionProgramId, major_id: input.majorId, updated_at: new Date() },
    });
    await writeAdmissionActivity(tx, user, input.leadId, "admission_profile_updated", "Cập nhật hồ sơ tuyển sinh.", { profileId });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_profile",
        entity_id: profileId,
        action: "update",
        old_data: {
          leadId: existing.lead_id,
          majorId: existing.major_id,
          statusId: existing.admission_status_id,
        },
        new_data: { leadId: input.leadId, majorId: input.majorId, statusId: input.admissionStatusId },
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: profileId } };
  });
}

export async function changeAdmissionStatus(
  user: AuthUser,
  profileId: string,
  statusId: string,
  ipAddress?: string,
  scopedProgramId?: string,
) {
  const existing = await getProfileForAction(user, profileId, scopedProgramId);
  if (!existing) return { ok: false as const, reason: "profile_not_found" as const };

  return prisma.$transaction(async (tx) => {
    const status = await tx.admission_statuses.findUnique({ where: { id: statusId }, select: { id: true, name: true } });
    if (!status) return { ok: false as const, reason: "status_not_found" as const };
    if (existing.admission_status_id) {
      const flowSetting = await tx.system_settings.findUnique({
        where: { key: flowSettingKey },
        select: { value: true },
      });
      const flow = parseStatusFlow(flowSetting?.value);
      const allowedNextStatuses = flow[existing.admission_status_id] ?? [];
      if (allowedNextStatuses.length > 0 && !allowedNextStatuses.includes(status.id)) {
        return { ok: false as const, reason: "invalid_status_transition" as const };
      }
    }

    await tx.admission_profiles.update({
      where: { id: profileId },
      data: { admission_status_id: status.id, updated_at: new Date() },
    });
    await writeAdmissionActivity(tx, user, existing.lead_id, "admission_status_changed", `Chuyển trạng thái hồ sơ sang ${status.name}.`, {
      fromStatusId: existing.admission_status_id,
      toStatusId: status.id,
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_profile",
        entity_id: profileId,
        action: "status_changed",
        old_data: { statusId: existing.admission_status_id },
        new_data: { statusId: status.id },
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: profileId, statusId: status.id } };
  });
}

function parseStatusFlow(value?: string | null) {
  if (!value) return {} as Record<string, string[]>;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, ids]) => [
        key,
        Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [],
      ]),
    );
  } catch {
    return {};
  }
}

export async function approveAdmissionProfile(
  user: AuthUser,
  profileId: string,
  statusId?: string,
  ipAddress?: string,
  scopedProgramId?: string,
) {
  const existing = await getProfileForAction(user, profileId, scopedProgramId);
  if (!existing) return { ok: false as const, reason: "profile_not_found" as const };

  return prisma.$transaction(async (tx) => {
    const status = statusId
      ? await tx.admission_statuses.findUnique({ where: { id: statusId }, select: { id: true, name: true } })
      : await tx.admission_statuses.upsert({
          where: { code: "APPROVED" },
          update: {},
          create: { code: "APPROVED", name: "Đã duyệt hồ sơ", color: "#2563EB" },
          select: { id: true, name: true },
        });
    if (!status) return { ok: false as const, reason: "status_not_found" as const };

    await tx.admission_profiles.update({
      where: { id: profileId },
      data: { admission_status_id: status.id, updated_at: new Date() },
    });
    await writeAdmissionActivity(tx, user, existing.lead_id, "admission_approved", "Duyệt hồ sơ tuyển sinh.", {
      fromStatusId: existing.admission_status_id,
      toStatusId: status.id,
    });
    if (existing.leads?.assigned_to) {
      await tx.notifications.create({
        data: {
          user_id: existing.leads.assigned_to,
          title: "Hồ sơ tuyển sinh đã được duyệt",
          content: `Hồ sơ của ${existing.leads.full_name} đã được duyệt.`,
          type: "admission_approval",
        },
      });
    }
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_profile",
        entity_id: profileId,
        action: "approve",
        old_data: { statusId: existing.admission_status_id },
        new_data: { statusId: status.id },
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: profileId, statusId: status.id } };
  });
}

export async function convertAdmissionToStudent(
  user: AuthUser,
  profileId: string,
  input: { classId?: string },
  ipAddress?: string,
  scopedProgramId?: string,
) {
  const profile = await getProfileForAction(user, profileId, scopedProgramId);
  if (!profile) return { ok: false as const, reason: "profile_not_found" as const };
  if (profile.students) return { ok: false as const, reason: "student_already_exists" as const };
  if (!profile.lead_id || !profile.institution_program_id || !profile.major_id) {
    return { ok: false as const, reason: "profile_incomplete" as const };
  }

  return prisma.$transaction(async (tx) => {
    const major = await tx.majors.findUnique({ where: { id: profile.major_id! }, select: { faculty_id: true } });
    const classItem = input.classId
      ? await tx.student_classes.findUnique({ where: { id: input.classId }, select: { id: true, faculty_id: true } })
      : null;
    if (input.classId && !classItem) return { ok: false as const, reason: "class_not_found" as const };

    const student = await tx.students.create({
      data: {
        student_code: `SV-${Date.now().toString(36).toUpperCase()}`,
        lead_id: profile.lead_id,
        admission_profile_id: profile.id,
        institution_program_id: profile.institution_program_id,
        major_id: profile.major_id,
        faculty_id: classItem?.faculty_id ?? major?.faculty_id ?? null,
        class_id: classItem?.id ?? null,
        status: "active",
        enrolled_at: new Date(),
      },
      select: { id: true, student_code: true },
    });
    const enrolledStatus = await tx.admission_statuses.upsert({
      where: { code: "ENROLLED" },
      update: {},
      create: { code: "ENROLLED", name: "Đã nhập học", color: "#16A34A" },
      select: { id: true },
    });
    await tx.admission_profiles.update({
      where: { id: profile.id },
      data: { admission_status_id: enrolledStatus.id, tuition_status: profile.tuition_status ?? "pending", updated_at: new Date() },
    });
    await writeAdmissionActivity(tx, user, profile.lead_id, "student_created_from_admission", "Chuyển hồ sơ tuyển sinh sang sinh viên.", {
      profileId: profile.id,
      studentId: student.id,
      studentCode: student.student_code,
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "student",
        entity_id: student.id,
        action: "create_from_admission",
        new_data: { profileId: profile.id, studentCode: student.student_code },
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: student.id, studentCode: student.student_code } };
  });
}
