import { compare } from "bcryptjs";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AccessTokenPayload, AuthUser } from "./auth.types";

type AccessScope = AuthUser["accessScope"];

const principalInclude = {
  user_departments: {
    select: {
      department_id: true,
    },
  },
  user_roles: {
    select: {
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
          role_institution_programs: {
            select: {
              institution_program_id: true,
              institution_programs: {
                select: { status: true },
              },
            },
          },
          id: true,
        },
      },
    },
  },
} as const;

function inferAccessScope(roles: string[]): AccessScope {
  if (roles.includes("DIRECTOR")) return "ALL";
  if (roles.includes("TELESALE")) return "ASSIGNED_ONLY";
  if (roles.includes("MARKETING_STAFF")) return "OWNED_ONLY";
  if (roles.includes("VIEWER")) return "READ_ONLY";
  return "DEPARTMENT";
}

async function getStoredAccessScope(userId: string): Promise<AccessScope | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ scope: AccessScope }>>(Prisma.sql`
      SELECT scope
      FROM user_access_scopes
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `);
    return rows[0]?.scope ?? null;
  } catch (error) {
    if (isMissingUserAccessScopesTable(error)) {
      return null;
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

async function serializeUser(user: {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  user_departments: Array<{ department_id: string | null }>;
  user_roles: Array<{
    roles: {
      id: string;
      code: string;
      role_permissions: Array<{ permissions: { code: string; is_active: boolean | null } | null }>;
      role_institution_programs: Array<{
        institution_program_id: string;
        institution_programs: { status: string | null };
      }>;
    } | null;
  }>;
}): Promise<AuthUser> {
  const roles = user.user_roles.flatMap((assignment) =>
    assignment.roles ? [assignment.roles.code] : [],
  );
  const permissions = user.user_roles.flatMap(
    (assignment) =>
      assignment.roles?.role_permissions.flatMap((grant) =>
        grant.permissions && (grant.permissions.is_active ?? true) ? [grant.permissions.code] : [],
      ) ?? [],
  );

  const uniqueRoles = [...new Set(roles)].sort();
  const roleIds = [
    ...new Set(user.user_roles.flatMap((assignment) => assignment.roles ? [assignment.roles.id] : [])),
  ];
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
    institutionProgramIds: [
      ...new Set(
        user.user_roles.flatMap((assignment) =>
          assignment.roles?.role_institution_programs.flatMap((grant) =>
            grant.institution_programs.status === "active" ? [grant.institution_program_id] : [],
          ) ?? [],
        ),
      ),
    ].sort(),
    accessScope: (await getStoredAccessScope(user.id)) ?? (await getRoleAccessScope(roleIds)) ?? inferAccessScope(uniqueRoles),
  };
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
    if (isMissingUserAccessScopesTable(error)) {
      return null;
    }
    throw error;
  }
}

export async function getAuthUser(userId: string): Promise<AuthUser | null> {
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

  return user ? serializeUser(user) : null;
}

export async function loginWithPassword(email: string, password: string, ipAddress?: string) {
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

  const authUser = await serializeUser(user);
  await prisma.$transaction([
    prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "auth_session",
        entity_id: user.id,
        action: "login",
        ip_address: ipAddress,
        new_data: { method: "password" },
      },
    }),
  ]);

  const payload: AccessTokenPayload = {
    sub: user.id,
    type: "access",
  };
  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
  });

  return {
    accessToken,
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
    user: authUser,
  };
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof payload !== "object" ||
      payload.type !== "access" ||
      typeof payload.sub !== "string"
    ) {
      return null;
    }

    return { sub: payload.sub, type: "access" };
  } catch {
    return null;
  }
}
