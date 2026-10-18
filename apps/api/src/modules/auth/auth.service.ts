import { defaultRoleAccessScope, resolveEffectiveAccessScope } from "@admission-crm/shared/access-scope";
import { compare } from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { env } from "../../config/env";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AccessTokenPayload, AuthUser } from "./auth.types";
import { createAuthSession } from "./auth-session.service";

type AccessScope = AuthUser["accessScope"];

const principalInclude = {
  user_departments: {
    select: {
      department_id: true,
    },
  },
  user_program_roles: {
    select: {
      institution_program_id: true,
      institution_programs: { select: { status: true } },
      roles: {
        select: {
          code: true,
          role_permissions: {
            select: {
              permissions: {
                select: {
                  code: true,
                  is_active: true,
                },
              },
            },
          },
          role_access_scopes: {
            select: { scope_code: true },
          },
          id: true,
        },
      },
    },
  },
} as const;

async function getStoredAccessScope(userId: string, institutionProgramId?: string): Promise<AccessScope | null> {
  try {
    if (institutionProgramId) {
      const programRows = await prisma.$queryRaw<Array<{ scope: AccessScope | null; has_any: boolean }>>(Prisma.sql`
        SELECT
          (
            SELECT scope
            FROM user_program_access_scopes
            WHERE user_id = ${userId}::uuid
              AND institution_program_id = ${institutionProgramId}::uuid
            LIMIT 1
          ) AS scope,
          EXISTS (
            SELECT 1
            FROM user_program_access_scopes
            WHERE user_id = ${userId}::uuid
          ) AS has_any
      `).catch((error: unknown) => {
        if (isMissingAccessScopeTable(error)) return [{ scope: null, has_any: false }];
        throw error;
      });
      if (programRows[0]?.has_any) return programRows[0].scope;
    }
    const rows = await prisma.$queryRaw<Array<{ scope: AccessScope }>>(Prisma.sql`
      SELECT scope
      FROM user_access_scopes
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `);
    return rows[0]?.scope ?? null;
  } catch (error) {
    if (isMissingAccessScopeTable(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingAccessScopeTable(error: unknown) {
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

async function serializeUser(user: {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  user_departments: Array<{ department_id: string | null }>;
  user_program_roles: Array<{
    institution_program_id: string;
    institution_programs: { status: string | null };
    roles: {
      id: string;
      code: string;
      role_permissions: Array<{ permissions: { code: string; is_active: boolean | null } | null }>;
      role_access_scopes: { scope_code: string } | null;
    } | null;
  }>;
}, requestedProgramId?: string): Promise<AuthUser> {
  const institutionProgramIds = user.user_program_roles
    .filter((assignment) => assignment.institution_programs.status === "active")
    .map((assignment) => assignment.institution_program_id).sort();
  const selectedProgramId = requestedProgramId ?? institutionProgramIds[0];
  const applicableAssignments = user.user_program_roles.filter((assignment) =>
    assignment.institution_program_id === selectedProgramId && assignment.institution_programs.status === "active",
  );
  const roles = applicableAssignments.flatMap((assignment) =>
    assignment.roles ? [assignment.roles.code] : [],
  );
  const permissions = applicableAssignments.flatMap(
    (assignment) =>
      assignment.roles?.role_permissions.flatMap((grant) =>
        grant.permissions && (grant.permissions.is_active ?? true) ? [grant.permissions.code] : [],
      ) ?? [],
  );

  const uniqueRoles = [...new Set(roles)].sort();
  const roleIds = [...new Set(applicableAssignments.flatMap((assignment) => assignment.roles ? [assignment.roles.id] : []))];
  const roleScope = applicableAssignments
    .flatMap((assignment) => assignment.roles?.role_access_scopes?.scope_code ?? [])
    .map((scope) => scope as AccessScope)
    .sort((left, right) => scopePriority(left) - scopePriority(right))[0];
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    avatarUrl: user.avatar_url,
    roles: uniqueRoles,
    permissions: [...new Set(permissions)].sort(),
    departmentIds: [
      ...new Set(
        user.user_departments.flatMap((membership) =>
          membership.department_id ? [membership.department_id] : [],
        ),
      ),
    ],
    institutionProgramIds,
    workingInstitutionProgramId: selectedProgramId ?? null,
    accessScope: resolveEffectiveAccessScope(
      roleScope ?? (await getRoleAccessScope(roleIds)) ?? defaultRoleAccessScope(uniqueRoles),
      await getStoredAccessScope(user.id, selectedProgramId),
    ),
  };
}

function scopePriority(scope: AccessScope) {
  return ["ALL", "DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"].indexOf(scope);
}

async function getRoleAccessScope(roleIds: string[]): Promise<AccessScope | null> {
  if (roleIds.length === 0) return null;
  try {
    const rows = await prisma.$queryRaw<Array<{ scope_code: AccessScope }>>(Prisma.sql`
      SELECT scope_code
      FROM role_access_scopes
      WHERE role_id IN (${Prisma.join(roleIds)})
      ORDER BY CASE scope_code
        WHEN 'ALL' THEN 1
        WHEN 'DEPARTMENT' THEN 2
        WHEN 'ASSIGNED_ONLY' THEN 3
        WHEN 'OWNED_ONLY' THEN 4
        WHEN 'READ_ONLY' THEN 5
        ELSE 99
      END
      LIMIT 1
    `);
    return rows[0]?.scope_code ?? null;
  } catch (error) {
    if (isMissingAccessScopeTable(error)) {
      return null;
    }
    throw error;
  }
}

export async function getAuthUser(userId: string, institutionProgramId?: string): Promise<AuthUser | null> {
  const user = await prisma.users.findFirst({
    where: {
      id: userId,
      deleted_at: null,
      status: "active",
    },
    select: {
      id: true,
      email: true,
      full_name: true,
      avatar_url: true,
      ...principalInclude,
    },
  });

  return user ? serializeUser(user, institutionProgramId) : null;
}

export async function loginWithPassword(email: string, password: string, ipAddress?: string, institutionProgramId?: string, rememberDevice = false) {
  const user = await prisma.users.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      deleted_at: null,
      status: "active",
    },
    select: {
      id: true,
      email: true,
      password_hash: true,
      full_name: true,
      avatar_url: true,
      ...principalInclude,
    },
  });

  if (!user || !user.password_hash.startsWith("$2")) {
    return null;
  }

  const matches = await compare(password, user.password_hash);
  if (!matches) {
    return null;
  }

  let authUser = await serializeUser(user, institutionProgramId);
  if (institutionProgramId && !authUser.institutionProgramIds.includes(institutionProgramId)) {
    authUser = await serializeUser(user);
  }
  const session = await createAuthSession(user.id, user.password_hash, rememberDevice, ipAddress);
  return session ? { ...session, user: authUser } : null;
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (
      typeof payload !== "object" ||
      payload.type !== "access" ||
      !z.uuid().safeParse(payload.sub).success ||
      !z.uuid().safeParse(payload.sid).success
    ) {
      return null;
    }

    return { sub: payload.sub as string, sid: payload.sid as string, type: "access" };
  } catch {
    return null;
  }
}
