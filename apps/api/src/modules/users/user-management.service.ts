import { hash } from "bcryptjs";

import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";

export type AccessScope = AuthUser["accessScope"];

export type UserListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  roleId?: string;
  departmentId?: string;
  sortBy: "createdAt" | "fullName" | "email" | "lastLoginAt";
  sortOrder: "asc" | "desc";
};

export type UserManagementInput = {
  fullName: string;
  email: string;
  phone?: string;
  status: "active" | "inactive" | "suspended";
  password?: string;
  roleIds: string[];
  departmentIds: string[];
  accessScope: AccessScope;
};

const userSortFields = {
  createdAt: "created_at",
  fullName: "full_name",
  email: "email",
  lastLoginAt: "last_login_at",
} as const;

const supportedScopes: AccessScope[] = ["ALL", "DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"];

type ManagedUserRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  status: string | null;
  last_login_at: Date | null;
  created_at: Date | null;
  user_roles: Array<{ roles: { id: string; code: string; name: string } | null }>;
  user_departments: Array<{ departments: { id: string; code: string | null; name: string } | null }>;
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

async function getAccessScopeMap(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, AccessScope>();
  try {
    const rows = await prisma.$queryRaw<Array<{ user_id: string; scope: AccessScope }>>(Prisma.sql`
      SELECT user_id, scope
      FROM user_access_scopes
      WHERE user_id IN (${Prisma.join(userIds)})
    `);
    return new Map(rows.map((row) => [row.user_id, row.scope]));
  } catch (error) {
    if (isMissingUserAccessScopesTable(error)) {
      return new Map();
    }
    throw error;
  }
}

function isMissingUserAccessScopesTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2010" &&
    "meta" in error &&
    typeof error.meta === "object" &&
    error.meta !== null &&
    "driverAdapterError" in error.meta &&
    String(error.meta.driverAdapterError).includes("TableDoesNotExist")
  );
}

function serializeManagedUser(user: ManagedUserRow, accessScope: AccessScope | undefined) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    status: user.status ?? "active",
    avatarUrl: user.avatar_url,
    lastLoginAt: user.last_login_at?.toISOString() ?? null,
    createdAt: user.created_at?.toISOString() ?? null,
    accessScope: accessScope ?? "DEPARTMENT",
    roles: user.user_roles.flatMap((assignment) => assignment.roles ? [assignment.roles] : []),
    departments: user.user_departments.flatMap((membership) => membership.departments ? [membership.departments] : []),
  };
}

export async function listManagedUsers(query: UserListQuery) {
  const where = {
    deleted_at: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.roleId ? { user_roles: { some: { role_id: query.roleId } } } : {}),
    ...(query.departmentId ? { user_departments: { some: { department_id: query.departmentId } } } : {}),
    ...(query.search
      ? {
          OR: [
            { full_name: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
            { phone: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.users.findMany({
      where,
      select: {
        id: true,
        full_name: true,
        email: true,
        phone: true,
        avatar_url: true,
        status: true,
        last_login_at: true,
        created_at: true,
        user_roles: { select: { roles: { select: { id: true, code: true, name: true } } } },
        user_departments: { select: { departments: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: [{ [userSortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.users.count({ where }),
  ]);
  const scopeMap = await getAccessScopeMap(items.map((item) => item.id));

  return {
    data: items.map((item) => serializeManagedUser(item, scopeMap.get(item.id))),
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
      roleId: query.roleId ?? "",
      departmentId: query.departmentId ?? "",
    },
  };
}

export async function getUserManagementOptions() {
  const [roles, departments] = await prisma.$transaction([
    prisma.roles.findMany({
      select: { id: true, code: true, name: true, description: true },
      orderBy: [{ code: "asc" }],
    }),
    prisma.departments.findMany({
      select: { id: true, code: true, name: true },
      orderBy: [{ name: "asc" }],
    }),
  ]);
  return { roles, departments, scopes: await getActiveAccessScopes() };
}

async function getActiveAccessScopes() {
  try {
    const rows = await prisma.$queryRaw<Array<{ code: AccessScope }>>(Prisma.sql`
      SELECT code
      FROM access_scopes
      WHERE is_active = true
      ORDER BY CASE code
        WHEN 'ALL' THEN 1
        WHEN 'DEPARTMENT' THEN 2
        WHEN 'ASSIGNED_ONLY' THEN 3
        WHEN 'OWNED_ONLY' THEN 4
        WHEN 'READ_ONLY' THEN 5
        ELSE 99
      END
    `);
    return rows.map((row) => row.code);
  } catch (error) {
    if (isMissingAccessScopesTable(error)) {
      return supportedScopes;
    }
    throw error;
  }
}

function isMissingAccessScopesTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2010" &&
    "meta" in error &&
    typeof error.meta === "object" &&
    error.meta !== null &&
    "driverAdapterError" in error.meta &&
    String(error.meta.driverAdapterError).includes("TableDoesNotExist")
  );
}

async function validateReferences(input: UserManagementInput) {
  const roleIds = unique(input.roleIds);
  const departmentIds = unique(input.departmentIds);
  const [roleCount, departmentCount] = await prisma.$transaction([
    prisma.roles.count({ where: { id: { in: roleIds } } }),
    prisma.departments.count({ where: { id: { in: departmentIds } } }),
  ]);
  if (roleCount !== roleIds.length) return { ok: false as const, reason: "role_not_found" as const };
  if (departmentCount !== departmentIds.length) return { ok: false as const, reason: "department_not_found" as const };
  return { ok: true as const, roleIds, departmentIds };
}

export async function createManagedUser(actor: AuthUser, input: UserManagementInput, ipAddress?: string) {
  const references = await validateReferences(input);
  if (!references.ok) return references;
  const email = input.email.trim().toLowerCase();
  if (await prisma.users.findFirst({ where: { email, deleted_at: null }, select: { id: true } })) {
    return { ok: false as const, reason: "email_exists" as const };
  }
  if (!input.password || input.password.length < 8) {
    return { ok: false as const, reason: "password_required" as const };
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        full_name: input.fullName.trim(),
        email,
        phone: input.phone?.trim() || null,
        status: input.status,
        password_hash: await hash(input.password!, 12),
      },
      select: { id: true },
    });
    if (references.roleIds.length > 0) {
      await tx.user_roles.createMany({ data: references.roleIds.map((roleId) => ({ user_id: user.id, role_id: roleId })) });
    }
    if (references.departmentIds.length > 0) {
      await tx.user_departments.createMany({ data: references.departmentIds.map((departmentId) => ({ user_id: user.id, department_id: departmentId })) });
    }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO user_access_scopes (user_id, scope)
      VALUES (${user.id}::uuid, ${input.accessScope})
    `);
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "user",
        entity_id: user.id,
        action: "create",
        ip_address: ipAddress,
        new_data: {
          fullName: input.fullName.trim(),
          email,
          phone: input.phone?.trim() || null,
          status: input.status,
          roleIds: references.roleIds,
          departmentIds: references.departmentIds,
          accessScope: input.accessScope,
        },
      },
    });
    return { ok: true as const, data: { id: user.id } };
  });
}

export async function updateManagedUser(actor: AuthUser, userId: string, input: UserManagementInput, ipAddress?: string) {
  const references = await validateReferences(input);
  if (!references.ok) return references;
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.users.findFirst({
    where: { id: userId, deleted_at: null },
    select: {
      id: true,
      full_name: true,
      email: true,
      phone: true,
      status: true,
      user_roles: { select: { role_id: true } },
      user_departments: { select: { department_id: true } },
    },
  });
  if (!existing) return { ok: false as const, reason: "user_not_found" as const };
  if (await prisma.users.findFirst({ where: { email, deleted_at: null, id: { not: userId } }, select: { id: true } })) {
    return { ok: false as const, reason: "email_exists" as const };
  }

  const oldScope = (await getAccessScopeMap([userId])).get(userId) ?? "DEPARTMENT";
  return prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id: userId },
      data: {
        full_name: input.fullName.trim(),
        email,
        phone: input.phone?.trim() || null,
        status: input.status,
        updated_at: new Date(),
        ...(input.password ? { password_hash: await hash(input.password, 12) } : {}),
      },
    });
    await tx.user_roles.deleteMany({ where: { user_id: userId } });
    await tx.user_departments.deleteMany({ where: { user_id: userId } });
    if (references.roleIds.length > 0) {
      await tx.user_roles.createMany({ data: references.roleIds.map((roleId) => ({ user_id: userId, role_id: roleId })) });
    }
    if (references.departmentIds.length > 0) {
      await tx.user_departments.createMany({ data: references.departmentIds.map((departmentId) => ({ user_id: userId, department_id: departmentId })) });
    }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO user_access_scopes (user_id, scope)
      VALUES (${userId}::uuid, ${input.accessScope})
      ON CONFLICT (user_id)
      DO UPDATE SET scope = EXCLUDED.scope, updated_at = now()
    `);
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "user",
        entity_id: userId,
        action: "update",
        ip_address: ipAddress,
        old_data: {
          fullName: existing.full_name,
          email: existing.email,
          phone: existing.phone,
          status: existing.status,
          roleIds: existing.user_roles.flatMap((role) => role.role_id ? [role.role_id] : []),
          departmentIds: existing.user_departments.flatMap((department) => department.department_id ? [department.department_id] : []),
          accessScope: oldScope,
        },
        new_data: {
          fullName: input.fullName.trim(),
          email,
          phone: input.phone?.trim() || null,
          status: input.status,
          roleIds: references.roleIds,
          departmentIds: references.departmentIds,
          accessScope: input.accessScope,
          passwordChanged: Boolean(input.password),
        },
      },
    });
    return { ok: true as const, data: { id: userId } };
  });
}
