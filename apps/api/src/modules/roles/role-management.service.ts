import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";

export type AccessScopeCode = AuthUser["accessScope"];

export type RoleInput = {
  name: string;
  code: string;
  description?: string;
  scopeCode: AccessScopeCode;
  permissionIds: string[];
  programIds: string[];
};

export type ScopeInput = {
  name: string;
  description?: string;
  isActive: boolean;
};

const supportedScopes: AccessScopeCode[] = ["ALL", "DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"];

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeRoleCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

async function getRoleScopeMap(roleIds: string[]) {
  if (roleIds.length === 0) return new Map<string, AccessScopeCode>();
  await ensureAccessScopeCatalog();
  const rows = await prisma.$queryRaw<Array<{ role_id: string; scope_code: AccessScopeCode }>>(Prisma.sql`
    SELECT role_id, scope_code
    FROM role_access_scopes
    WHERE role_id IN (${Prisma.join(roleIds)})
  `);
  return new Map(rows.map((row) => [row.role_id, row.scope_code]));
}

async function ensureAccessScopeCatalog() {
  await prisma.$executeRaw(Prisma.sql`
    CREATE TABLE IF NOT EXISTS access_scopes (
      code varchar(50) PRIMARY KEY,
      name varchar(150) NOT NULL,
      description text,
      is_active boolean DEFAULT true,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now(),
      CONSTRAINT access_scopes_code_check CHECK (code IN ('ALL', 'DEPARTMENT', 'ASSIGNED_ONLY', 'OWNED_ONLY', 'READ_ONLY'))
    )
  `);
  await prisma.$executeRaw(Prisma.sql`
    CREATE TABLE IF NOT EXISTS role_access_scopes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      scope_code varchar(50) NOT NULL REFERENCES access_scopes(code) ON DELETE RESTRICT,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now(),
      CONSTRAINT role_access_scopes_role_id_unique UNIQUE (role_id)
    )
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO access_scopes (code, name, description)
    VALUES
      ('ALL', 'Toàn hệ thống', 'Xem dữ liệu trong toàn bộ hệ thống theo permission được cấp.'),
      ('DEPARTMENT', 'Theo phòng ban', 'Giới hạn dữ liệu theo phòng ban của người dùng.'),
      ('ASSIGNED_ONLY', 'Dữ liệu được giao', 'Chỉ xem dữ liệu được phân công trực tiếp.'),
      ('OWNED_ONLY', 'Dữ liệu tự tạo', 'Chỉ xem dữ liệu do chính người dùng tạo hoặc sở hữu.'),
      ('READ_ONLY', 'Chỉ xem', 'Chỉ đọc dashboard và báo cáo, không thao tác nghiệp vụ.')
    ON CONFLICT (code) DO NOTHING
  `);
}

export async function listRoles() {
  await ensureAccessScopeCatalog();
  const roles = await prisma.roles.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      created_at: true,
      role_permissions: { select: { permissions: { select: { id: true, code: true, name: true, module: true, description: true, is_active: true } } } },
      role_institution_programs: {
        select: {
          institution_programs: {
            select: { id: true, code: true, name: true, institutions: { select: { name: true } } },
          },
        },
      },
      _count: { select: { user_roles: true } },
    },
    orderBy: [{ code: "asc" }],
  });
  const scopeMap = await getRoleScopeMap(roles.map((role) => role.id));

  return {
    data: roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      scopeCode: scopeMap.get(role.id) ?? defaultScopeForRole(role.code),
      userCount: role._count.user_roles,
      permissions: role.role_permissions.flatMap((grant) => grant.permissions ? [{ ...grant.permissions, isActive: grant.permissions.is_active ?? true }] : []),
      programs: role.role_institution_programs.map((grant) => ({
        id: grant.institution_programs.id,
        code: grant.institution_programs.code,
        name: grant.institution_programs.name,
        institutionName: grant.institution_programs.institutions.name,
      })),
      createdAt: role.created_at?.toISOString() ?? null,
    })),
  };
}

export async function getRoleManagementOptions() {
  await ensureAccessScopeCatalog();
  const [permissions, scopes, programs] = await Promise.all([
    prisma.permissions.findMany({
      where: { is_active: true },
      select: { id: true, code: true, name: true, module: true, description: true },
      orderBy: [{ module: "asc" }, { code: "asc" }],
    }),
    listAccessScopes(),
    prisma.institution_programs.findMany({
      where: { status: "active", institutions: { is: { status: "active" } } },
      select: { id: true, code: true, name: true, institutions: { select: { name: true } } },
      orderBy: [{ institutions: { name: "asc" } }, { name: "asc" }],
    }),
  ]);
  return {
    permissions,
    scopes: scopes.data,
    programs: programs.map((program) => ({
      id: program.id,
      code: program.code,
      name: program.name,
      institutionName: program.institutions.name,
    })),
  };
}

export async function listAccessScopes() {
  await ensureAccessScopeCatalog();
  const rows = await prisma.$queryRaw<Array<{ code: AccessScopeCode; name: string; description: string | null; is_active: boolean | null }>>(Prisma.sql`
    SELECT code, name, description, is_active
    FROM access_scopes
    ORDER BY CASE code
      WHEN 'ALL' THEN 1
      WHEN 'DEPARTMENT' THEN 2
      WHEN 'ASSIGNED_ONLY' THEN 3
      WHEN 'OWNED_ONLY' THEN 4
      WHEN 'READ_ONLY' THEN 5
      ELSE 99
    END
  `);
  return {
    data: rows.map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description,
      isActive: row.is_active ?? true,
    })),
  };
}

export async function createRole(actor: AuthUser, input: RoleInput, ipAddress?: string) {
  const validation = await validateRoleInput(input);
  if (!validation.ok) return validation;
  const code = normalizeRoleCode(input.code);
  if (await prisma.roles.findUnique({ where: { code }, select: { id: true } })) {
    return { ok: false as const, reason: "code_exists" as const };
  }

  return prisma.$transaction(async (tx) => {
    const role = await tx.roles.create({
      data: { code, name: input.name.trim(), description: input.description?.trim() || null },
      select: { id: true },
    });
    if (validation.permissionIds.length > 0) {
      await tx.role_permissions.createMany({
        data: validation.permissionIds.map((permissionId) => ({ role_id: role.id, permission_id: permissionId })),
      });
    }
    await tx.role_institution_programs.createMany({
      data: validation.programIds.map((institutionProgramId) => ({
        role_id: role.id,
        institution_program_id: institutionProgramId,
      })),
    });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO role_access_scopes (role_id, scope_code)
      VALUES (${role.id}::uuid, ${input.scopeCode})
    `);
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "role",
        entity_id: role.id,
        action: "create",
        ip_address: ipAddress,
        new_data: { code, name: input.name.trim(), description: input.description?.trim() || null, scopeCode: input.scopeCode, permissionIds: validation.permissionIds, programIds: validation.programIds },
      },
    });
    return { ok: true as const, data: { id: role.id } };
  });
}

export async function updateRole(actor: AuthUser, roleId: string, input: RoleInput, ipAddress?: string) {
  const validation = await validateRoleInput(input);
  if (!validation.ok) return validation;
  const code = normalizeRoleCode(input.code);
  const existing = await prisma.roles.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      role_permissions: { select: { permission_id: true } },
      role_institution_programs: { select: { institution_program_id: true } },
    },
  });
  if (!existing) return { ok: false as const, reason: "role_not_found" as const };
  if (await prisma.roles.findFirst({ where: { code, id: { not: roleId } }, select: { id: true } })) {
    return { ok: false as const, reason: "code_exists" as const };
  }
  const oldScope = (await getRoleScopeMap([roleId])).get(roleId) ?? defaultScopeForRole(existing.code);

  return prisma.$transaction(async (tx) => {
    await tx.roles.update({
      where: { id: roleId },
      data: { code, name: input.name.trim(), description: input.description?.trim() || null },
    });
    await tx.role_permissions.deleteMany({ where: { role_id: roleId } });
    if (validation.permissionIds.length > 0) {
      await tx.role_permissions.createMany({
        data: validation.permissionIds.map((permissionId) => ({ role_id: roleId, permission_id: permissionId })),
      });
    }
    await tx.role_institution_programs.deleteMany({ where: { role_id: roleId } });
    await tx.role_institution_programs.createMany({
      data: validation.programIds.map((institutionProgramId) => ({
        role_id: roleId,
        institution_program_id: institutionProgramId,
      })),
    });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO role_access_scopes (role_id, scope_code)
      VALUES (${roleId}::uuid, ${input.scopeCode})
      ON CONFLICT (role_id)
      DO UPDATE SET scope_code = EXCLUDED.scope_code, updated_at = now()
    `);
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "role",
        entity_id: roleId,
        action: "update",
        ip_address: ipAddress,
        old_data: {
          code: existing.code,
          name: existing.name,
          description: existing.description,
          scopeCode: oldScope,
          permissionIds: existing.role_permissions.flatMap((grant) => grant.permission_id ? [grant.permission_id] : []),
          programIds: existing.role_institution_programs.map((grant) => grant.institution_program_id),
        },
        new_data: { code, name: input.name.trim(), description: input.description?.trim() || null, scopeCode: input.scopeCode, permissionIds: validation.permissionIds, programIds: validation.programIds },
      },
    });
    return { ok: true as const, data: { id: roleId } };
  });
}

export async function deleteRole(actor: AuthUser, roleId: string, ipAddress?: string) {
  const role = await prisma.roles.findUnique({
    where: { id: roleId },
    select: { id: true, code: true, name: true, _count: { select: { user_roles: true } } },
  });
  if (!role) return { ok: false as const, reason: "role_not_found" as const };
  if (role._count.user_roles > 0) return { ok: false as const, reason: "role_in_use" as const };

  await prisma.$transaction([
    prisma.roles.delete({ where: { id: roleId } }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "role",
        entity_id: roleId,
        action: "delete",
        ip_address: ipAddress,
        old_data: { code: role.code, name: role.name },
      },
    }),
  ]);
  return { ok: true as const, data: { id: roleId } };
}

export async function updateAccessScope(actor: AuthUser, code: AccessScopeCode, input: ScopeInput, ipAddress?: string) {
  await ensureAccessScopeCatalog();
  if (!supportedScopes.includes(code)) return { ok: false as const, reason: "scope_not_supported" as const };
  const existing = (await listAccessScopes()).data.find((scope) => scope.code === code);
  if (!existing) return { ok: false as const, reason: "scope_not_found" as const };

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      UPDATE access_scopes
      SET name = ${input.name.trim()}, description = ${input.description?.trim() || null}, is_active = ${input.isActive}, updated_at = now()
      WHERE code = ${code}
    `),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "access_scope",
        entity_id: null,
        action: "update",
        ip_address: ipAddress,
        old_data: existing,
        new_data: { code, name: input.name.trim(), description: input.description?.trim() || null, isActive: input.isActive },
      },
    }),
  ]);
  return { ok: true as const, data: { code } };
}

async function validateRoleInput(input: RoleInput) {
  await ensureAccessScopeCatalog();
  const permissionIds = unique(input.permissionIds);
  const programIds = unique(input.programIds);
  if (!supportedScopes.includes(input.scopeCode)) return { ok: false as const, reason: "scope_not_supported" as const };
  const activeScopes = await listAccessScopes();
  if (!activeScopes.data.some((scope) => scope.code === input.scopeCode && scope.isActive)) {
    return { ok: false as const, reason: "scope_inactive" as const };
  }
  const permissionCount = await prisma.permissions.count({ where: { id: { in: permissionIds } } });
  if (permissionCount !== permissionIds.length) return { ok: false as const, reason: "permission_not_found" as const };
  if (programIds.length === 0) return { ok: false as const, reason: "program_required" as const };
  const programCount = await prisma.institution_programs.count({
    where: { id: { in: programIds }, status: "active", institutions: { is: { status: "active" } } },
  });
  if (programCount !== programIds.length) return { ok: false as const, reason: "program_not_found" as const };
  return { ok: true as const, permissionIds, programIds };
}

function defaultScopeForRole(roleCode: string): AccessScopeCode {
  if (roleCode === "DIRECTOR") return "ALL";
  if (roleCode === "TELESALE") return "ASSIGNED_ONLY";
  if (roleCode === "MARKETING_STAFF") return "OWNED_ONLY";
  if (roleCode === "VIEWER") return "READ_ONLY";
  return "DEPARTMENT";
}
