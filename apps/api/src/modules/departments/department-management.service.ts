import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

export type DepartmentListQuery = {
  page: number;
  limit: number;
  search?: string;
  sortBy: "createdAt" | "code" | "name";
  sortOrder: "asc" | "desc";
};

export type DepartmentInput = {
  name: string;
  code?: string;
  managerId?: string;
  memberIds: string[];
};

const departmentSortFields = {
  createdAt: "created_at",
  code: "code",
  name: "name",
} as const;

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeDepartmentCode(code?: string) {
  const normalized = code?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  return normalized || null;
}

function serializeUser(user: { id: string; full_name: string; email: string }) {
  return { id: user.id, fullName: user.full_name, email: user.email };
}

async function validateUsers(managerId: string | undefined, memberIds: string[]) {
  const ids = unique([...(managerId ? [managerId] : []), ...memberIds]);
  if (ids.length === 0) return { ok: true as const, memberIds };

  const users = await prisma.users.findMany({
    where: { id: { in: ids }, deleted_at: null, status: "active" },
    select: { id: true },
  });
  if (users.length !== ids.length) return { ok: false as const, reason: "user_not_found" as const };
  return { ok: true as const, memberIds: unique([...(managerId ? [managerId] : []), ...memberIds]) };
}

function serializeDepartment(department: {
  id: string;
  name: string;
  code: string | null;
  created_at: Date | null;
  users: { id: string; full_name: string; email: string } | null;
  user_departments: Array<{ users: { id: string; full_name: string; email: string } | null }>;
  _count: { user_departments: number; lead_assignments: number };
}) {
  return {
    id: department.id,
    name: department.name,
    code: department.code,
    manager: department.users ? serializeUser(department.users) : null,
    members: department.user_departments.flatMap((membership) =>
      membership.users ? [serializeUser(membership.users)] : [],
    ),
    memberCount: department._count.user_departments,
    leadAssignmentCount: department._count.lead_assignments,
    createdAt: department.created_at?.toISOString() ?? null,
  };
}

export async function listManagedDepartments(query: DepartmentListQuery) {
  const where = {
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { code: { contains: query.search, mode: "insensitive" as const } },
            { users: { full_name: { contains: query.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.departments.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        created_at: true,
        users: { select: { id: true, full_name: true, email: true } },
        user_departments: {
          select: { users: { select: { id: true, full_name: true, email: true } } },
          orderBy: { users: { full_name: "asc" } },
        },
        _count: { select: { user_departments: true, lead_assignments: true } },
      },
      orderBy: [{ [departmentSortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.departments.count({ where }),
  ]);

  return {
    data: items.map(serializeDepartment),
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

export async function getDepartmentManagementOptions() {
  const users = await prisma.users.findMany({
    where: { deleted_at: null, status: "active" },
    select: { id: true, full_name: true, email: true },
    orderBy: [{ full_name: "asc" }, { email: "asc" }],
    take: 1000,
  });
  return { users: users.map(serializeUser) };
}

export async function createManagedDepartment(actor: AuthUser, input: DepartmentInput, ipAddress?: string) {
  const code = normalizeDepartmentCode(input.code);
  if (code && (await prisma.departments.findUnique({ where: { code }, select: { id: true } }))) {
    return { ok: false as const, reason: "code_exists" as const };
  }

  const references = await validateUsers(input.managerId, unique(input.memberIds));
  if (!references.ok) return references;

  return prisma.$transaction(async (tx) => {
    const department = await tx.departments.create({
      data: {
        name: input.name.trim(),
        code,
        manager_id: input.managerId || null,
      },
      select: { id: true },
    });
    if (references.memberIds.length > 0) {
      await tx.user_departments.createMany({
        data: references.memberIds.map((userId) => ({ user_id: userId, department_id: department.id })),
        skipDuplicates: true,
      });
    }
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "department",
        entity_id: department.id,
        action: "create",
        ip_address: ipAddress,
        new_data: { name: input.name.trim(), code, managerId: input.managerId || null, memberIds: references.memberIds },
      },
    });
    return { ok: true as const, data: department };
  });
}

export async function updateManagedDepartment(actor: AuthUser, id: string, input: DepartmentInput, ipAddress?: string) {
  const existing = await prisma.departments.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      manager_id: true,
      user_departments: { select: { user_id: true } },
    },
  });
  if (!existing) return { ok: false as const, reason: "department_not_found" as const };

  const code = normalizeDepartmentCode(input.code);
  if (code && (await prisma.departments.findFirst({ where: { code, id: { not: id } }, select: { id: true } }))) {
    return { ok: false as const, reason: "code_exists" as const };
  }

  const references = await validateUsers(input.managerId, unique(input.memberIds));
  if (!references.ok) return references;

  await prisma.$transaction(async (tx) => {
    await tx.departments.update({
      where: { id },
      data: { name: input.name.trim(), code, manager_id: input.managerId || null },
    });
    await tx.user_departments.deleteMany({ where: { department_id: id } });
    if (references.memberIds.length > 0) {
      await tx.user_departments.createMany({
        data: references.memberIds.map((userId) => ({ user_id: userId, department_id: id })),
        skipDuplicates: true,
      });
    }
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "department",
        entity_id: id,
        action: "update",
        ip_address: ipAddress,
        old_data: {
          name: existing.name,
          code: existing.code,
          managerId: existing.manager_id,
          memberIds: existing.user_departments.flatMap((membership) => (membership.user_id ? [membership.user_id] : [])),
        },
        new_data: { name: input.name.trim(), code, managerId: input.managerId || null, memberIds: references.memberIds },
      },
    });
  });
  return { ok: true as const, data: { id } };
}

export async function deleteManagedDepartment(actor: AuthUser, id: string, ipAddress?: string) {
  const department = await prisma.departments.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      manager_id: true,
      _count: { select: { user_departments: true, lead_assignments: true } },
    },
  });
  if (!department) return { ok: false as const, reason: "department_not_found" as const };
  if (department._count.user_departments > 0 || department._count.lead_assignments > 0) {
    return { ok: false as const, reason: "department_in_use" as const };
  }

  await prisma.$transaction([
    prisma.departments.delete({ where: { id } }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "department",
        entity_id: id,
        action: "delete",
        ip_address: ipAddress,
        old_data: { name: department.name, code: department.code, managerId: department.manager_id },
      },
    }),
  ]);
  return { ok: true as const, data: { id } };
}
