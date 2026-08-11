import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "../leads/lead-list.service";

export type StudentListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  institutionProgramId?: string;
  majorId?: string;
  facultyId?: string;
  classId?: string;
  sortBy: "enrolledAt" | "studentCode" | "status";
  sortOrder: "asc" | "desc";
};

export type StudentUpdateInput = {
  status: string;
  facultyId?: string;
  classId?: string;
};

const studentSortFields = {
  enrolledAt: "enrolled_at",
  studentCode: "student_code",
  status: "status",
} as const;

export async function listStudents(user: AuthUser, query: StudentListQuery) {
  const where = {
    AND: [
      { leads: { is: getLeadScopeWhere(user) } },
      ...(query.search
        ? [
            {
              OR: [
                { student_code: { contains: query.search, mode: "insensitive" as const } },
                {
                  leads: {
                    is: { full_name: { contains: query.search, mode: "insensitive" as const } },
                  },
                },
              ],
            },
          ]
        : []),
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
      ...(query.majorId ? [{ major_id: query.majorId }] : []),
      ...(query.facultyId ? [{ faculty_id: query.facultyId }] : []),
      ...(query.classId ? [{ class_id: query.classId }] : []),
    ],
  };
  const orderBy = { [studentSortFields[query.sortBy]]: query.sortOrder };
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.students.findMany({
      where,
      select: {
        id: true,
        student_code: true,
        status: true,
        enrolled_at: true,
        created_at: true,
        leads: { select: { id: true, lead_code: true, full_name: true } },
        admission_profiles: { select: { id: true, admission_code: true } },
        institution_programs: { select: { id: true, name: true, institutions: { select: { name: true } } } },
        majors: { select: { id: true, name: true } },
        faculties: { select: { id: true, name: true } },
        student_classes: { select: { id: true, name: true } },
      },
      orderBy: [orderBy, { id: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.students.count({ where }),
  ]);

  return {
    data: items.map((student) => ({
      id: student.id,
      studentCode: student.student_code,
      status: student.status,
      enrolledAt: student.enrolled_at?.toISOString() ?? null,
      createdAt: student.created_at?.toISOString() ?? null,
      lead: student.leads
        ? {
            id: student.leads.id,
            leadCode: student.leads.lead_code,
            fullName: student.leads.full_name,
          }
        : null,
      admissionProfile: student.admission_profiles
        ? {
            id: student.admission_profiles.id,
            admissionCode: student.admission_profiles.admission_code,
          }
        : null,
      institutionProgram: student.institution_programs
        ? { id: student.institution_programs.id, name: student.institution_programs.name, institutionName: student.institution_programs.institutions.name }
        : null,
      major: student.majors,
      faculty: student.faculties,
      studentClass: student.student_classes,
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
      status: query.status ?? "",
      institutionProgramId: query.institutionProgramId ?? "",
      majorId: query.majorId ?? "",
      facultyId: query.facultyId ?? "",
      classId: query.classId ?? "",
    },
  };
}

export async function getStudentDetail(user: AuthUser, id: string, institutionProgramId?: string) {
  const student = await findStudentDetail(user, id, institutionProgramId);

  return student ? serializeStudentDetail(student) : null;
}

function findStudentDetail(user: AuthUser, id: string, institutionProgramId?: string) {
  return prisma.students.findFirst({
    where: {
      id,
      leads: { is: getLeadScopeWhere(user) },
      ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
    },
    select: {
      id: true,
      student_code: true,
      status: true,
      enrolled_at: true,
      created_at: true,
      leads: {
        select: {
          id: true,
          lead_code: true,
          full_name: true,
          gender: true,
          date_of_birth: true,
          student_profiles: {
            select: {
              high_school_name: true,
              graduation_year: true,
              nationality: true,
              ethnicity: true,
            },
          },
        },
      },
      admission_profiles: {
        select: {
          id: true,
          admission_code: true,
          training_type: true,
          enrollment_batch: true,
          fee_status: true,
          tuition_status: true,
        },
      },
      institution_programs: { select: { id: true, name: true, institutions: { select: { name: true } } } },
      majors: { select: { id: true, name: true } },
      faculties: { select: { id: true, name: true } },
      student_classes: { select: { id: true, name: true, code: true, faculties: { select: { id: true, name: true } } } },
      student_services: {
        select: {
          id: true,
          type: true,
          content: true,
          created_at: true,
          users: { select: { id: true, full_name: true } },
        },
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        take: 5,
      },
    },
  });
}

export async function updateStudentAcademicInfo(
  user: AuthUser,
  id: string,
  input: StudentUpdateInput,
  ipAddress?: string,
  institutionProgramId?: string,
) {
  const existing = await prisma.students.findFirst({
    where: {
      id,
      leads: { is: getLeadScopeWhere(user) },
      ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
    },
    select: {
      id: true,
      status: true,
      faculty_id: true,
      class_id: true,
      institution_program_id: true,
    },
  });
  if (!existing) return { ok: false as const, reason: "student_not_found" as const };

  const [faculty, classItem] = await Promise.all([
    input.facultyId
      ? prisma.faculties.findUnique({ where: { id: input.facultyId }, select: { id: true } })
      : Promise.resolve(null),
    input.classId
      ? prisma.student_classes.findUnique({ where: { id: input.classId }, select: { id: true, faculty_id: true } })
      : Promise.resolve(null),
  ]);

  if (input.facultyId && !faculty) return { ok: false as const, reason: "faculty_not_found" as const };
  if (input.classId && !classItem) return { ok: false as const, reason: "class_not_found" as const };
  if (classItem?.faculty_id && input.facultyId && classItem.faculty_id !== input.facultyId) {
    return { ok: false as const, reason: "class_faculty_mismatch" as const };
  }

  const nextFacultyId = input.facultyId ?? classItem?.faculty_id ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.students.update({
      where: { id },
      data: {
        status: input.status,
        faculty_id: nextFacultyId,
        class_id: input.classId ?? null,
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "student",
        entity_id: id,
        action: "update_academic_info",
        old_data: {
          status: existing.status,
          facultyId: existing.faculty_id,
          classId: existing.class_id,
        },
        new_data: {
          status: input.status,
          facultyId: nextFacultyId,
          classId: input.classId ?? null,
        },
        ip_address: ipAddress,
      },
    });
  });

  return { ok: true as const, data: await getStudentDetail(user, id, institutionProgramId) };
}

export async function getStudentFilterOptions(user: AuthUser, institutionProgramId?: string) {
  const scopedStudentWhere = {
    leads: { is: getLeadScopeWhere(user) },
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const [institutionPrograms, majors, faculties, classes, statuses] = await prisma.$transaction([
    prisma.institution_programs.findMany({ where: { status: "active", students: { some: { leads: { is: getLeadScopeWhere(user) } } } }, select: { id: true, name: true, institutions: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.majors.findMany({
      where: institutionProgramId
        ? { OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }] }
        : undefined,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.faculties.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.student_classes.findMany({
      select: { id: true, name: true, faculties: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.students.findMany({
      where: scopedStudentWhere,
      select: { status: true },
      distinct: ["status"],
      take: 100,
    }),
  ]);

  return {
    institutionPrograms: institutionPrograms.map((program) => ({ id: program.id, name: program.name, institutionName: program.institutions.name })),
    majors,
    faculties,
    classes: classes.map((studentClass) => ({
      id: studentClass.id,
      name: studentClass.name,
      facultyName: studentClass.faculties?.name ?? null,
    })),
    statuses: statuses.flatMap((student) => (student.status ? [student.status] : [])).sort(),
  };
}

type StudentDetailRecord = NonNullable<Awaited<ReturnType<typeof findStudentDetail>>>;

function serializeStudentDetail(student: StudentDetailRecord) {
  return {
    id: student.id,
    studentCode: student.student_code,
    status: student.status,
    enrolledAt: student.enrolled_at?.toISOString() ?? null,
    createdAt: student.created_at?.toISOString() ?? null,
    lead: student.leads
      ? {
          id: student.leads.id,
          leadCode: student.leads.lead_code,
          fullName: student.leads.full_name,
          gender: student.leads.gender,
          dateOfBirth: student.leads.date_of_birth?.toISOString() ?? null,
          profile: student.leads.student_profiles
            ? {
                highSchoolName: student.leads.student_profiles.high_school_name,
                graduationYear: student.leads.student_profiles.graduation_year,
                nationality: student.leads.student_profiles.nationality,
                ethnicity: student.leads.student_profiles.ethnicity,
              }
            : null,
        }
      : null,
    admissionProfile: student.admission_profiles
      ? {
          id: student.admission_profiles.id,
          admissionCode: student.admission_profiles.admission_code,
          trainingType: student.admission_profiles.training_type,
          enrollmentBatch: student.admission_profiles.enrollment_batch,
          feeStatus: student.admission_profiles.fee_status,
          tuitionStatus: student.admission_profiles.tuition_status,
        }
      : null,
    institutionProgram: student.institution_programs
      ? { id: student.institution_programs.id, name: student.institution_programs.name, institutionName: student.institution_programs.institutions.name }
      : null,
    major: student.majors,
    faculty: student.faculties,
    studentClass: student.student_classes
      ? {
          id: student.student_classes.id,
          name: student.student_classes.name,
          code: student.student_classes.code,
          faculty: student.student_classes.faculties,
        }
      : null,
    recentServices: student.student_services.map((service) => ({
      id: service.id,
      type: service.type,
      content: service.content,
      createdAt: service.created_at?.toISOString() ?? null,
      handledBy: service.users ? { id: service.users.id, fullName: service.users.full_name } : null,
    })),
  };
}
