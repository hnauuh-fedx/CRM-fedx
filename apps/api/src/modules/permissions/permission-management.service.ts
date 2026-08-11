import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

export type PermissionListQuery = {
  page: number;
  limit: number;
  search?: string;
  module?: string;
  status?: "active" | "inactive";
  sortBy: "createdAt" | "code" | "name" | "module";
  sortOrder: "asc" | "desc";
};

export type PermissionInput = {
  code: string;
  name: string;
  module?: string;
  description?: string;
  isActive: boolean;
};

const permissionSortFields = {
  createdAt: "created_at",
  code: "code",
  name: "name",
  module: "module",
} as const;

function normalizePermissionCode(code: string) {
  return code.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
}

export async function listPermissions(query: PermissionListQuery) {
  const where = {
    ...(query.module ? { module: query.module } : {}),
    ...(query.status ? { is_active: query.status === "active" } : {}),
    ...(query.search
      ? {
          OR: [
            { code: { contains: query.search, mode: "insensitive" as const } },
            { name: { contains: query.search, mode: "insensitive" as const } },
            { module: { contains: query.search, mode: "insensitive" as const } },
            { description: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.permissions.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        module: true,
        description: true,
        is_active: true,
        created_at: true,
        _count: { select: { role_permissions: true } },
      },
      orderBy: [{ [permissionSortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.permissions.count({ where }),
  ]);

  return {
    data: items.map((permission) => ({
      id: permission.id,
      code: permission.code,
      name: permission.name,
      module: permission.module,
      description: permission.description,
      isActive: permission.is_active ?? true,
      roleCount: permission._count.role_permissions,
      createdAt: permission.created_at?.toISOString() ?? null,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: { search: query.search ?? "", module: query.module ?? "", status: query.status ?? "" },
  };
}

export async function getPermissionManagementOptions() {
  const modules = await prisma.permissions.findMany({
    where: { module: { not: null } },
    select: { module: true },
    distinct: ["module"],
    orderBy: { module: "asc" },
    take: 200,
  });
  return { modules: modules.flatMap((item) => (item.module ? [item.module] : [])), statuses: ["active", "inactive"] };
}

export async function createPermission(actor: AuthUser, input: PermissionInput, ipAddress?: string) {
  const code = normalizePermissionCode(input.code);
  if (await prisma.permissions.findUnique({ where: { code }, select: { id: true } })) {
    return { ok: false as const, reason: "code_exists" as const };
  }

  const permission = await prisma.$transaction(async (tx) => {
    const created = await tx.permissions.create({
      data: {
        code,
        name: input.name.trim(),
        module: input.module?.trim() || null,
        description: input.description?.trim() || null,
        is_active: input.isActive,
      },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "permission",
        entity_id: created.id,
        action: "create",
        ip_address: ipAddress,
        new_data: { code, name: input.name.trim(), module: input.module?.trim() || null, description: input.description?.trim() || null, isActive: input.isActive },
      },
    });
    return created;
  });

  return { ok: true as const, data: permission };
}

export async function updatePermission(actor: AuthUser, id: string, input: PermissionInput, ipAddress?: string) {
  const existing = await prisma.permissions.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, module: true, description: true, is_active: true },
  });
  if (!existing) return { ok: false as const, reason: "permission_not_found" as const };

  const code = normalizePermissionCode(input.code);
  if (await prisma.permissions.findFirst({ where: { code, id: { not: id } }, select: { id: true } })) {
    return { ok: false as const, reason: "code_exists" as const };
  }

  await prisma.$transaction([
    prisma.permissions.update({
      where: { id },
      data: { code, name: input.name.trim(), module: input.module?.trim() || null, description: input.description?.trim() || null, is_active: input.isActive },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "permission",
        entity_id: id,
        action: "update",
        ip_address: ipAddress,
        old_data: existing,
        new_data: { code, name: input.name.trim(), module: input.module?.trim() || null, description: input.description?.trim() || null, isActive: input.isActive },
      },
    }),
  ]);
  return { ok: true as const, data: { id } };
}

export async function deletePermission(actor: AuthUser, id: string, ipAddress?: string) {
  const permission = await prisma.permissions.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, module: true, description: true, is_active: true, _count: { select: { role_permissions: true } } },
  });
  if (!permission) return { ok: false as const, reason: "permission_not_found" as const };
  if (permission._count.role_permissions > 0) return { ok: false as const, reason: "permission_in_use" as const };

  await prisma.$transaction([
    prisma.permissions.delete({ where: { id } }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "permission",
        entity_id: id,
        action: "delete",
        ip_address: ipAddress,
        old_data: { code: permission.code, name: permission.name, module: permission.module, description: permission.description, isActive: permission.is_active ?? true },
      },
    }),
  ]);
  return { ok: true as const, data: { id } };
}
