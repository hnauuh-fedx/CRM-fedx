import { prisma } from "../../database/prisma";

export type MajorListQuery = {
  page: number;
  limit: number;
  search?: string;
  sortBy: "createdAt" | "name" | "code";
  sortOrder: "asc" | "desc";
};

export type MajorInput = {
  name: string;
  code: string;
  facultyId?: string;
};

const sortFields = {
  createdAt: "created_at",
  name: "name",
  code: "code",
} as const;

export async function listProgramMajors(institutionProgramId: string, query: MajorListQuery) {
  const where = {
    institution_program_id: institutionProgramId,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { code: { contains: query.search, mode: "insensitive" as const } },
            { faculties: { is: { name: { contains: query.search, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.majors.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        faculty_id: true,
        created_at: true,
        faculties: { select: { id: true, name: true } },
        _count: { select: { leads: true, admission_profiles: true, students: true } },
      },
      orderBy: [{ [sortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.majors.count({ where }),
  ]);

  return {
    data: items.map((major) => ({
      id: major.id,
      name: major.name,
      code: major.code,
      facultyId: major.faculty_id,
      facultyName: major.faculties?.name ?? null,
      leadCount: major._count.leads,
      admissionCount: major._count.admission_profiles,
      studentCount: major._count.students,
      createdAt: major.created_at?.toISOString() ?? null,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: { search: query.search ?? "" },
  };
}

export async function getMajorManagementOptions() {
  const faculties = await prisma.faculties.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { faculties };
}

export async function createProgramMajor(userId: string, institutionProgramId: string, input: MajorInput) {
  const normalizedCode = input.code.trim().toUpperCase();
  return prisma.$transaction(async (tx) => {
    if (!await tx.institution_programs.findUnique({ where: { id: institutionProgramId }, select: { id: true } })) {
      return { ok: false as const, reason: "program_not_found" as const };
    }
    if (input.facultyId && !await tx.faculties.findUnique({ where: { id: input.facultyId }, select: { id: true } })) {
      return { ok: false as const, reason: "faculty_not_found" as const };
    }
    if (await tx.majors.findFirst({ where: { institution_program_id: institutionProgramId, code: normalizedCode }, select: { id: true } })) {
      return { ok: false as const, reason: "code_already_exists" as const };
    }

    const major = await tx.majors.create({
      data: {
        institution_program_id: institutionProgramId,
        name: input.name.trim(),
        code: normalizedCode,
        faculty_id: input.facultyId ?? null,
      },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: userId,
        entity_type: "major",
        entity_id: major.id,
        action: "create",
        new_data: { institutionProgramId, name: input.name.trim(), code: normalizedCode, facultyId: input.facultyId ?? null },
      },
    });
    return { ok: true as const, data: major };
  });
}

export async function updateProgramMajor(userId: string, institutionProgramId: string, majorId: string, input: MajorInput) {
  const normalizedCode = input.code.trim().toUpperCase();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.majors.findFirst({
      where: { id: majorId, institution_program_id: institutionProgramId },
      select: { id: true, name: true, code: true, faculty_id: true },
    });
    if (!existing) {
      return { ok: false as const, reason: "major_not_found" as const };
    }
    if (input.facultyId && !await tx.faculties.findUnique({ where: { id: input.facultyId }, select: { id: true } })) {
      return { ok: false as const, reason: "faculty_not_found" as const };
    }
    if (await tx.majors.findFirst({
      where: { institution_program_id: institutionProgramId, code: normalizedCode, id: { not: majorId } },
      select: { id: true },
    })) {
      return { ok: false as const, reason: "code_already_exists" as const };
    }

    await tx.majors.update({
      where: { id: majorId },
      data: { name: input.name.trim(), code: normalizedCode, faculty_id: input.facultyId ?? null },
    });
    await tx.audit_logs.create({
      data: {
        user_id: userId,
        entity_type: "major",
        entity_id: majorId,
        action: "update",
        old_data: { name: existing.name, code: existing.code, facultyId: existing.faculty_id },
        new_data: { name: input.name.trim(), code: normalizedCode, facultyId: input.facultyId ?? null },
      },
    });
    return { ok: true as const, data: { id: majorId } };
  });
}

export async function deleteProgramMajor(userId: string, institutionProgramId: string, majorId: string) {
  return prisma.$transaction(async (tx) => {
    const major = await tx.majors.findFirst({
      where: { id: majorId, institution_program_id: institutionProgramId },
      select: {
        id: true,
        name: true,
        code: true,
        _count: { select: { leads: true, admission_profiles: true, students: true } },
      },
    });
    if (!major) {
      return { ok: false as const, reason: "major_not_found" as const };
    }
    if (major._count.leads > 0 || major._count.admission_profiles > 0 || major._count.students > 0) {
      return { ok: false as const, reason: "major_in_use" as const };
    }
    await tx.majors.delete({ where: { id: majorId } });
    await tx.audit_logs.create({
      data: {
        user_id: userId,
        entity_type: "major",
        entity_id: majorId,
        action: "delete",
        old_data: { institutionProgramId, name: major.name, code: major.code },
      },
    });
    return { ok: true as const, data: { id: majorId } };
  });
}
