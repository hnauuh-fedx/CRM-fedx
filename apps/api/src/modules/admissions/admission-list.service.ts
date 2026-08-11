import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "../leads/lead-list.service";

export type AdmissionListQuery = {
  page: number;
  limit: number;
  search?: string;
  statusId?: string;
  institutionProgramId?: string;
  majorId?: string;
  sortBy: "createdAt" | "admissionCode" | "applicationReceivedDate";
  sortOrder: "asc" | "desc";
};

const admissionSortFields = {
  createdAt: "created_at",
  admissionCode: "admission_code",
  applicationReceivedDate: "application_received_date",
} as const;

export async function listAdmissionProfiles(user: AuthUser, query: AdmissionListQuery) {
  const where = {
    AND: [
      { leads: { is: getLeadScopeWhere(user) } },
      ...(query.search
        ? [
            {
              OR: [
                { admission_code: { contains: query.search, mode: "insensitive" as const } },
                {
                  leads: {
                    is: { full_name: { contains: query.search, mode: "insensitive" as const } },
                  },
                },
              ],
            },
          ]
        : []),
      ...(query.statusId ? [{ admission_status_id: query.statusId }] : []),
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
      ...(query.majorId ? [{ major_id: query.majorId }] : []),
    ],
  };
  const orderBy = { [admissionSortFields[query.sortBy]]: query.sortOrder };
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.admission_profiles.findMany({
      where,
      select: {
        id: true,
        admission_code: true,
        training_type: true,
        class_code: true,
        subject_group_code: true,
        subject_group_name: true,
        score_1: true,
        score_2: true,
        score_3: true,
        admission_score: true,
        fee_status: true,
        tuition_status: true,
        application_received_date: true,
        enrollment_batch: true,
        training_code: true,
        registration_station: true,
        decision_number: true,
        decision_signed_date: true,
        monthly_revenue: true,
        created_at: true,
        students: { select: { id: true, student_code: true } },
        leads: { select: { id: true, lead_code: true, full_name: true } },
        admission_statuses: { select: { id: true, name: true, color: true } },
        institution_programs: {
          select: { id: true, name: true, institutions: { select: { name: true } } },
        },
        majors: {
          select: {
            id: true,
            name: true,
            faculties: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [orderBy, { id: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.admission_profiles.count({ where }),
  ]);

  return {
    data: items.map((profile) => ({
      id: profile.id,
      admissionCode: profile.admission_code,
      trainingType: profile.training_type,
      classCode: profile.class_code,
      subjectGroupCode: profile.subject_group_code,
      subjectGroupName: profile.subject_group_name,
      score1: profile.score_1 == null ? null : String(profile.score_1),
      score2: profile.score_2 == null ? null : String(profile.score_2),
      score3: profile.score_3 == null ? null : String(profile.score_3),
      admissionScore: profile.admission_score == null ? null : String(profile.admission_score),
      feeStatus: profile.fee_status,
      tuitionStatus: profile.tuition_status,
      applicationReceivedDate: profile.application_received_date?.toISOString() ?? null,
      enrollmentBatch: profile.enrollment_batch,
      trainingCode: profile.training_code,
      registrationStation: profile.registration_station,
      decisionNumber: profile.decision_number,
      decisionSignedDate: profile.decision_signed_date?.toISOString() ?? null,
      monthlyRevenue: profile.monthly_revenue == null ? null : String(profile.monthly_revenue),
      createdAt: profile.created_at?.toISOString() ?? null,
      student: profile.students ? { id: profile.students.id, studentCode: profile.students.student_code } : null,
      lead: profile.leads
        ? {
            id: profile.leads.id,
            leadCode: profile.leads.lead_code,
            fullName: profile.leads.full_name,
          }
        : null,
      status: profile.admission_statuses,
      institutionProgram: profile.institution_programs
        ? {
            id: profile.institution_programs.id,
            name: profile.institution_programs.name,
            institutionName: profile.institution_programs.institutions.name,
          }
        : null,
      major: profile.majors
        ? {
            id: profile.majors.id,
            name: profile.majors.name,
            faculty: profile.majors.faculties,
          }
        : null,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: {
      search: query.search ?? "",
      statusId: query.statusId ?? "",
      institutionProgramId: query.institutionProgramId ?? "",
      majorId: query.majorId ?? "",
    },
  };
}

export async function getAdmissionFilterOptions(user: AuthUser, institutionProgramId?: string) {
  const admissionScopeWhere = {
    leads: { is: getLeadScopeWhere(user) },
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const [statuses, institutionPrograms, majors] = await prisma.$transaction([
    prisma.admission_statuses.findMany({
      where: { admission_profiles: { some: admissionScopeWhere } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.institution_programs.findMany({
      where: { status: "active", admission_profiles: { some: { leads: { is: getLeadScopeWhere(user) } } } },
      select: { id: true, name: true, institutions: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.majors.findMany({
      where: institutionProgramId
        ? { OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }] }
        : undefined,
      select: { id: true, name: true, faculties: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    statuses,
    institutionPrograms: institutionPrograms.map((program) => ({
      id: program.id,
      name: program.name,
      institutionName: program.institutions.name,
    })),
    majors: majors.map((major) => ({
      id: major.id,
      name: major.name,
      facultyName: major.faculties?.name ?? null,
    })),
  };
}
