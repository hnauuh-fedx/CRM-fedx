import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "../leads/lead-list.service";

type ListQuery<TSort extends string> = {
  page: number;
  limit: number;
  search?: string;
  type?: string;
  status?: string;
  studentId?: string;
  institutionProgramId?: string;
  sortBy: TSort;
  sortOrder: "asc" | "desc";
};

const toIso = (value?: Date | null) => value?.toISOString() ?? null;
export const studentServiceStatuses = ["open", "in_progress", "resolved", "closed", "cancelled"] as const;
export type StudentServiceStatus = (typeof studentServiceStatuses)[number];

export type StudentServiceInput = {
  studentId: string;
  type: string;
  content: string;
  handledBy?: string;
  status?: StudentServiceStatus;
};

export type StudentServiceUpdateInput = {
  type?: string;
  content?: string;
  handledBy?: string | null;
  status?: StudentServiceStatus;
};

export async function listStudentServices(user: AuthUser, query: ListQuery<"createdAt" | "type" | "status">) {
  const where = getStudentServiceWhere(user, query.search, query.type, query.status, query.studentId, query.institutionProgramId);
  const sortFields = { createdAt: "created_at", type: "type", status: "status" } as const;
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.student_services.findMany({
      where,
      select: {
        id: true,
        type: true,
        status: true,
        content: true,
        handled_by: true,
        created_at: true,
        updated_at: true,
        users: { select: { full_name: true } },
        students: {
          select: {
            id: true,
            student_code: true,
            status: true,
            leads: { select: { full_name: true } },
            faculties: { select: { name: true } },
            student_classes: { select: { name: true } },
          },
        },
      },
      orderBy: [{ [sortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.student_services.count({ where }),
  ]);

  return {
    data: items.map((item) => serializeStudentService(item)),
    pagination: getPagination(query.page, query.limit, total),
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
  };
}

export async function getStudentServiceOptions(user: AuthUser, institutionProgramId?: string) {
  const studentScopeWhere = {
    leads: { is: getLeadScopeWhere(user) },
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const serviceWhere = { students: { is: studentScopeWhere } };
  const [types, statuses, students, assignees] = await prisma.$transaction([
    prisma.student_services.findMany({
      where: serviceWhere,
      select: { type: true },
      distinct: ["type"],
      orderBy: { type: "asc" },
      take: 100,
    }),
    prisma.student_services.findMany({
      where: serviceWhere,
      select: { status: true },
      distinct: ["status"],
      orderBy: { status: "asc" },
      take: 100,
    }),
    prisma.students.findMany({
      where: studentScopeWhere,
      select: { id: true, student_code: true, leads: { select: { full_name: true } } },
      orderBy: [{ enrolled_at: "desc" }, { id: "asc" }],
      take: 100,
    }),
    prisma.users.findMany({
      where: { deleted_at: null, status: "active" },
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
      take: 200,
    }),
  ]);

  return {
    types: types.flatMap((item) => (item.type ? [item.type] : [])),
    statuses: Array.from(new Set([...studentServiceStatuses, ...statuses.flatMap((item) => (item.status ? [item.status] : []))])),
    students: students.map((student) => ({
      id: student.id,
      studentCode: student.student_code,
      fullName: student.leads?.full_name ?? null,
    })),
    assignees: assignees.map((user) => ({ id: user.id, fullName: user.full_name })),
  };
}

export async function createStudentServiceRequest(
  user: AuthUser,
  input: StudentServiceInput,
  ipAddress?: string,
  institutionProgramId?: string,
) {
  const validation = await validateStudentServiceReferences(user, input.studentId, input.handledBy, institutionProgramId);
  if (!validation.ok) return validation;

  return prisma.$transaction(async (tx) => {
    const service = await tx.student_services.create({
      data: {
        student_id: input.studentId,
        type: input.type.trim(),
        content: input.content.trim(),
        handled_by: input.handledBy || null,
        status: input.status ?? "open",
      },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "student_service",
        entity_id: service.id,
        action: "create",
        new_data: {
          studentId: input.studentId,
          type: input.type,
          handledBy: input.handledBy ?? null,
          status: input.status ?? "open",
        },
        ip_address: ipAddress,
      },
    });

    return { ok: true as const, data: { id: service.id } };
  });
}

export async function updateStudentServiceRequest(
  user: AuthUser,
  serviceId: string,
  input: StudentServiceUpdateInput,
  ipAddress?: string,
  institutionProgramId?: string,
) {
  const existing = await prisma.student_services.findFirst({
    where: {
      id: serviceId,
      students: { is: { leads: { is: getLeadScopeWhere(user) }, ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) } },
    },
    select: { type: true },
  });
  if (!existing) return { ok: false as const, reason: "service_not_found" as const };

  const current = await prisma.student_services.findUnique({
    where: { id: serviceId },
    select: { student_id: true, type: true, content: true, handled_by: true, status: true },
  });
  if (!current?.student_id) return { ok: false as const, reason: "service_not_found" as const };

  const validation = await validateStudentServiceReferences(user, current.student_id, input.handledBy ?? undefined, institutionProgramId);
  if (!validation.ok) return validation;

  await prisma.$transaction(async (tx) => {
    await tx.student_services.update({
      where: { id: serviceId },
      data: {
        ...(input.type !== undefined ? { type: input.type.trim() } : {}),
        ...(input.content !== undefined ? { content: input.content.trim() } : {}),
        ...(input.handledBy !== undefined ? { handled_by: input.handledBy || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updated_at: new Date(),
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "student_service",
        entity_id: serviceId,
        action: "update",
        old_data: {
          type: current.type,
          content: current.content,
          handledBy: current.handled_by,
          status: current.status,
        },
        new_data: input,
        ip_address: ipAddress,
      },
    });
  });

  return { ok: true as const, data: { id: serviceId } };
}

export async function listStudentSupportHistory(user: AuthUser, query: ListQuery<"createdAt" | "type" | "status">) {
  return listStudentServices(user, query);
}

async function validateStudentServiceReferences(user: AuthUser, studentId: string, handledBy?: string | null, institutionProgramId?: string) {
  const [student, handler] = await Promise.all([
    prisma.students.findFirst({
      where: { id: studentId, leads: { is: getLeadScopeWhere(user) }, ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) },
      select: { id: true },
    }),
    handledBy
      ? prisma.users.findFirst({ where: { id: handledBy, deleted_at: null, status: "active" }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!student) return { ok: false as const, reason: "student_not_found" as const };
  if (handledBy && !handler) return { ok: false as const, reason: "handler_not_found" as const };
  return { ok: true as const };
}

function getStudentServiceWhere(user: AuthUser, search?: string, type?: string, status?: string, studentId?: string, institutionProgramId?: string) {
  return {
    AND: [
      { students: { is: { leads: { is: getLeadScopeWhere(user) } } } },
      ...(search
        ? [
            {
              OR: [
                { type: { contains: search, mode: "insensitive" as const } },
                { content: { contains: search, mode: "insensitive" as const } },
                { students: { is: { student_code: { contains: search, mode: "insensitive" as const } } } },
                {
                  students: {
                    is: {
                      leads: { is: { full_name: { contains: search, mode: "insensitive" as const } } },
                    },
                  },
                },
              ],
            },
          ]
        : []),
      ...(type ? [{ type }] : []),
      ...(status ? [{ status }] : []),
      ...(studentId ? [{ student_id: studentId }] : []),
      ...(institutionProgramId ? [{ students: { is: { institution_program_id: institutionProgramId } } }] : []),
    ],
  };
}

function serializeStudentService(item: {
  id: string;
  type: string | null;
  status: string | null;
  content: string | null;
  handled_by: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  users: { full_name: string } | null;
  students: {
    id: string;
    student_code: string;
    status: string | null;
    leads: { full_name: string } | null;
    faculties: { name: string } | null;
    student_classes: { name: string } | null;
  } | null;
}) {
  return {
    id: item.id,
    studentId: item.students?.id ?? null,
    studentCode: item.students?.student_code ?? null,
    studentName: item.students?.leads?.full_name ?? null,
    studentStatus: item.students?.status ?? null,
    facultyName: item.students?.faculties?.name ?? null,
    className: item.students?.student_classes?.name ?? null,
    type: item.type,
    status: item.status,
    content: item.content,
    handledById: item.handled_by,
    handledBy: item.users?.full_name ?? null,
    createdAt: toIso(item.created_at),
    updatedAt: toIso(item.updated_at),
  };
}

function getPagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
