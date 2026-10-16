import { defaultRoleAccessScope, resolveEffectiveAccessScope } from "@admission-crm/shared/access-scope";
import { hash } from "bcryptjs";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import { getAuthUser } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
export type AccessScope = AuthUser["accessScope"];
export type UserListQuery = {
  page: number; limit: number; search?: string; status?: string; roleId?: string; departmentId?: string;
  sortBy: "createdAt" | "fullName" | "email" | "lastLoginAt"; sortOrder: "asc" | "desc";
};
export type UserManagementInput = {
  fullName: string; email: string; phone?: string; status: "active" | "inactive" | "suspended"; password?: string;
  programAssignments: Array<{ institutionProgramId: string; roleId: string }>;
  departmentIds: string[]; accessScope: AccessScope;
};
const supportedScopes: AccessScope[] = ["ALL", "DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"];
const userSortFields = { createdAt: "created_at", fullName: "full_name", email: "email", lastLoginAt: "last_login_at" } as const;
async function getAccessScopeMap(userIds: string[], institutionProgramId: string) {
  if (userIds.length === 0) return new Map<string, AccessScope>();
  try {
    const rows = await prisma.$queryRaw<Array<{ user_id: string; scope: AccessScope | null }>>(Prisma.sql`
      SELECT u.id AS user_id,
        COALESCE(program_scope.scope, CASE WHEN NOT EXISTS (
          SELECT 1 FROM user_program_access_scopes any_scope WHERE any_scope.user_id = u.id
        ) THEN legacy_scope.scope END) AS scope
      FROM users u
      LEFT JOIN user_program_access_scopes program_scope
        ON program_scope.user_id = u.id AND program_scope.institution_program_id = ${institutionProgramId}::uuid
      LEFT JOIN user_access_scopes legacy_scope ON legacy_scope.user_id = u.id
      WHERE u.id IN (${Prisma.join(userIds)})
    `);
    return new Map(rows.flatMap((row) => row.scope ? [[row.user_id, row.scope] as const] : []));
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


export async function getManageableProgramIds(actor: AuthUser) {
  const principals = await Promise.all(actor.institutionProgramIds.map((id) => getAuthUser(actor.id, id)));
  return actor.institutionProgramIds.filter((_, index) => principals[index]?.permissions.includes("user.manage"));
}

export async function listManagedUsers(query: UserListQuery, institutionProgramId: string, actor: AuthUser) {
  const manageableProgramIds = await getManageableProgramIds(actor);
  const where: Prisma.usersWhereInput = {
    deleted_at: null,
    user_program_roles: { some: { institution_program_id: institutionProgramId, ...(query.roleId ? { role_id: query.roleId } : {}) } },
    ...(query.status ? { status: query.status } : {}),
    ...(query.departmentId ? { user_departments: { some: { department_id: query.departmentId } } } : {}),
    ...(query.search ? { OR: [
      { full_name: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
    ] } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.users.findMany({ where, select: {
      id: true, full_name: true, email: true, phone: true, avatar_url: true, status: true, last_login_at: true, created_at: true,
      user_program_roles: { where: { institution_program_id: { in: manageableProgramIds } }, select: {
        institution_program_id: true, role_id: true,
        roles: { select: { id: true, code: true, name: true, role_access_scopes: { select: { scope_code: true } } } },
        institution_programs: { select: { name: true, institution_name: true } },
      } },
      user_departments: { select: { departments: { select: { id: true, code: true, name: true } } } },
    }, orderBy: [{ [userSortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.users.count({ where }),
  ]);
  const scopes = await getAccessScopeMap(items.map((item) => item.id), institutionProgramId);
  return {
    data: items.map((user) => ({
      id: user.id, fullName: user.full_name, email: user.email, phone: user.phone, avatarUrl: user.avatar_url,
      status: user.status ?? "active", lastLoginAt: user.last_login_at?.toISOString() ?? null, createdAt: user.created_at?.toISOString() ?? null,
      accessScope: resolveEffectiveAccessScope(
        (user.user_program_roles.find((grant) => grant.institution_program_id === institutionProgramId)?.roles.role_access_scopes?.scope_code as AccessScope | undefined)
          ?? defaultRoleAccessScope(user.user_program_roles.filter((grant) => grant.institution_program_id === institutionProgramId).map((grant) => grant.roles.code)),
        scopes.get(user.id),
      ),
      roles: user.user_program_roles.filter((grant) => grant.institution_program_id === institutionProgramId).map((grant) => ({ id: grant.roles.id, code: grant.roles.code, name: grant.roles.name })),
      programAssignments: user.user_program_roles.map((grant) => ({
        institutionProgramId: grant.institution_program_id, roleId: grant.role_id,
        programName: grant.institution_programs.name, institutionName: grant.institution_programs.institution_name, roleName: grant.roles.name,
      })),
      departments: user.user_departments.flatMap((membership) => membership.departments ? [membership.departments] : []),
    })),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: { search: query.search ?? "", status: query.status ?? "", roleId: query.roleId ?? "", departmentId: query.departmentId ?? "" },
  };
}

export async function getUserManagementOptions(institutionProgramId: string, actor: AuthUser) {
  const manageableProgramIds = await getManageableProgramIds(actor);
  const [programs, departments, roles] = await prisma.$transaction([
    prisma.institution_programs.findMany({ where: { id: { in: manageableProgramIds }, status: "active" },
      select: { id: true, code: true, name: true, institution_name: true,
        role_institution_programs: { select: { roles: { select: { id: true, code: true, name: true, description: true, role_access_scopes: { select: { scope_code: true } } } } } } },
      orderBy: [{ institution_name: "asc" }, { name: "asc" }] }),
    prisma.departments.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.roles.findMany({ where: { role_institution_programs: { some: { institution_program_id: institutionProgramId } } },
      select: { id: true, code: true, name: true, description: true }, orderBy: { code: "asc" } }),
  ]);
  return { roles, departments, scopes: await getActiveAccessScopes(), programs: programs.map((program) => ({
    id: program.id, code: program.code, name: program.name, institutionName: program.institution_name,
    roles: program.role_institution_programs.map((grant) => ({
      id: grant.roles.id, code: grant.roles.code, name: grant.roles.name, description: grant.roles.description,
      scopeCode: (grant.roles.role_access_scopes?.scope_code as AccessScope | undefined) ?? defaultRoleAccessScope([grant.roles.code]),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  })) };
}

async function validateReferences(actor: AuthUser, input: UserManagementInput) {
  const programIds = input.programAssignments.map((grant) => grant.institutionProgramId);
  if (!programIds.length || new Set(programIds).size !== programIds.length) return { ok: false as const, reason: "invalid_program_assignments" as const };
  const manageableProgramIds = await getManageableProgramIds(actor);
  if (programIds.some((id) => !manageableProgramIds.includes(id))) return { ok: false as const, reason: "program_forbidden" as const };
  const departmentIds = [...new Set(input.departmentIds)];
  const [roleCount, departmentCount] = await prisma.$transaction([
    prisma.role_institution_programs.count({ where: { OR: input.programAssignments.map((grant) => ({
      institution_program_id: grant.institutionProgramId, role_id: grant.roleId, institution_programs: { status: "active" },
    })) } }),
    prisma.departments.count({ where: { id: { in: departmentIds } } }),
  ]);
  if (roleCount !== programIds.length) return { ok: false as const, reason: "role_not_found" as const };
  if (departmentCount !== departmentIds.length) return { ok: false as const, reason: "department_not_found" as const };
  return { ok: true as const, manageableProgramIds, departmentIds };
}

export async function createManagedUser(actor: AuthUser, input: UserManagementInput, institutionProgramId: string, ipAddress?: string) {
  return saveManagedUser(actor, input, institutionProgramId, ipAddress);
}
export async function updateManagedUser(actor: AuthUser, userId: string, input: UserManagementInput, institutionProgramId: string, ipAddress?: string) {
  return saveManagedUser(actor, input, institutionProgramId, ipAddress, userId);
}
async function saveManagedUser(actor: AuthUser, input: UserManagementInput, institutionProgramId: string, ipAddress?: string, userId?: string) {
  const references = await validateReferences(actor, input);
  if (!references.ok) return references;
  const email = input.email.trim().toLowerCase();
  if (!userId && (!input.password || input.password.length < 8)) return { ok: false as const, reason: "password_required" as const };
  return prisma.$transaction(async (tx) => {
    const existing = userId ? await tx.users.findFirst({ where: {
      id: userId, deleted_at: null, user_program_roles: { some: { institution_program_id: institutionProgramId } },
    }, select: { id: true, full_name: true, email: true, phone: true, status: true,
      user_program_roles: { where: { institution_program_id: { in: references.manageableProgramIds } }, select: { institution_program_id: true, role_id: true } },
      user_departments: { select: { department_id: true } },
    } }) : null;
    if (userId && !existing) return { ok: false as const, reason: "user_not_found" as const };
    if (await tx.users.findFirst({ where: { email, deleted_at: null, ...(userId ? { id: { not: userId } } : {}) }, select: { id: true } })) return { ok: false as const, reason: "email_exists" as const };
    const data = { full_name: input.fullName.trim(), email, phone: input.phone?.trim() || null, status: input.status, updated_at: new Date(),
      ...(input.password ? { password_hash: await hash(input.password, 12) } : {}) };
    const user = userId ? await tx.users.update({ where: { id: userId }, data, select: { id: true } })
      : await tx.users.create({ data: { ...data, password_hash: data.password_hash! }, select: { id: true } });
    // Only replace assignments in programs the actor can manage; preserve hidden grants.
    await tx.user_program_roles.deleteMany({ where: { user_id: user.id, institution_program_id: { in: references.manageableProgramIds } } });
    await tx.user_program_roles.createMany({ data: input.programAssignments.map((grant) => ({
      user_id: user.id, institution_program_id: grant.institutionProgramId, role_id: grant.roleId,
    })) });
    await tx.user_departments.deleteMany({ where: { user_id: user.id } });
    if (references.departmentIds.length) await tx.user_departments.createMany({ data: references.departmentIds.map((id) => ({ user_id: user.id, department_id: id })) });
    const selectedIds = input.programAssignments.map((grant) => grant.institutionProgramId);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM user_program_access_scopes WHERE user_id = ${user.id}::uuid
        AND institution_program_id IN (${Prisma.join(references.manageableProgramIds)})
        AND institution_program_id NOT IN (${Prisma.join(selectedIds)})
    `);
    const currentAssignment = input.programAssignments.find((grant) => grant.institutionProgramId === institutionProgramId);
    const currentRole = currentAssignment ? await tx.roles.findUniqueOrThrow({ where: { id: currentAssignment.roleId }, select: { code: true, role_access_scopes: { select: { scope_code: true } } } }) : null;
    const effectiveScope = currentRole ? resolveEffectiveAccessScope(
      (currentRole.role_access_scopes?.scope_code as AccessScope | undefined) ?? defaultRoleAccessScope([currentRole.code]), input.accessScope,
    ) : null;
    if (effectiveScope) await tx.$executeRaw(Prisma.sql`
      INSERT INTO user_program_access_scopes (user_id, institution_program_id, scope)
      VALUES (${user.id}::uuid, ${institutionProgramId}::uuid, ${effectiveScope})
      ON CONFLICT (user_id, institution_program_id) DO UPDATE SET scope = EXCLUDED.scope, updated_at = now()
    `);
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "user", entity_id: user.id, action: userId ? "update" : "create", ip_address: ipAddress,
      old_data: existing ? { fullName: existing.full_name, email: existing.email, phone: existing.phone, status: existing.status,
        programAssignments: existing.user_program_roles, departmentIds: existing.user_departments.map((item) => item.department_id) } : Prisma.JsonNull,
      new_data: { fullName: data.full_name, email, phone: data.phone, status: input.status, programAssignments: input.programAssignments,
        departmentIds: references.departmentIds, accessScope: effectiveScope, requestedAccessScope: input.accessScope, institutionProgramId, passwordChanged: Boolean(input.password) },
    } });
    return { ok: true as const, data: { id: user.id } };
  });
}
