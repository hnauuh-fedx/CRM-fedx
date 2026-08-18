import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";

import { app } from "../app";
import { prisma } from "../database/prisma";
import { Prisma } from "../generated/prisma/client";

type JsonRecord = Record<string, unknown>;
type AccessScope = "ALL" | "DEPARTMENT" | "ASSIGNED_ONLY" | "OWNED_ONLY" | "READ_ONLY";

const runId = randomUUID().slice(0, 8).toUpperCase();
const managerPassword = `Manager-${runId}`;
const limitedPassword = `Limited-${runId}`;
const managedPassword = `Managed-${runId}`;
const managerEmail = `integration.manager.${runId.toLowerCase()}@example.test`;
const limitedEmail = `integration.limited.${runId.toLowerCase()}@example.test`;
const managedEmail = `integration.managed.${runId.toLowerCase()}@example.test`;
const roleCode = `INTEGRATION_SCOPE_${runId}`;
const limitedRoleCode = `INTEGRATION_LIMITED_${runId}`;
const departmentCode = `INT-SCOPE-${runId}`;

let server: ReturnType<typeof app.listen> | null = null;
let managerUserId: string | null = null;
let limitedUserId: string | null = null;
let managedUserId: string | null = null;
let managerRoleId: string | null = null;
let limitedRoleId: string | null = null;
let managedRoleId: string | null = null;
let departmentId: string | null = null;
let programId: string | null = null;
let originalOwnedOnlyScope: { name: string; description: string | null; isActive: boolean } | null = null;
const createdPermissionIds: string[] = [];

async function request(
  baseUrl: string,
  path: string,
  options: { token?: string; method?: string; body?: JsonRecord } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  return { status: response.status, payload };
}

async function login(baseUrl: string, email: string, password: string) {
  const response = await request(baseUrl, "/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(response.status, 200, `Cannot login with ${email}.`);
  assert.equal(typeof response.payload.accessToken, "string");
  return response.payload;
}

async function preparePrincipal() {
  await cleanupStaleFixtures();
  await ensureAccessScopes();
  const permissionIds = await ensurePermissions(["user.manage", "role.manage", "department.manage"]);
  const program = await prisma.institution_programs.findFirst({
    where: { status: "active", institutions: { is: { status: "active" } } },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  assert.ok(program, "An active institution program is required for role access integration tests.");
  programId = program.id;

  const managerRole = await prisma.roles.create({
    data: {
      code: `INTEGRATION_MANAGER_${runId}`,
      name: "Integration Access Manager",
      description: "Temporary role for user/role/scope integration tests.",
    },
    select: { id: true },
  });
  managerRoleId = managerRole.id;
  await prisma.role_permissions.createMany({
    data: [...permissionIds.values()].map((permissionId) => ({ role_id: managerRole.id, permission_id: permissionId })),
  });
  await prisma.role_access_scopes.create({
    data: { role_id: managerRole.id, scope_code: "ALL" },
  });
  await prisma.role_institution_programs.create({
    data: { role_id: managerRole.id, institution_program_id: program.id },
  });

  const limitedRole = await prisma.roles.create({
    data: {
      code: limitedRoleCode,
      name: "Integration Limited Role",
      description: "Temporary role without management permissions.",
    },
    select: { id: true },
  });
  limitedRoleId = limitedRole.id;
  await prisma.role_access_scopes.create({
    data: { role_id: limitedRole.id, scope_code: "READ_ONLY" },
  });
  await prisma.role_institution_programs.create({
    data: { role_id: limitedRole.id, institution_program_id: program.id },
  });

  const [managerUser, limitedUser] = await Promise.all([
    prisma.users.create({
      data: {
        email: managerEmail,
        password_hash: await hash(managerPassword, 10),
        full_name: "Integration Access Manager",
        status: "active",
      },
      select: { id: true },
    }),
    prisma.users.create({
      data: {
        email: limitedEmail,
        password_hash: await hash(limitedPassword, 10),
        full_name: "Integration Limited User",
        status: "active",
      },
      select: { id: true },
    }),
  ]);
  managerUserId = managerUser.id;
  limitedUserId = limitedUser.id;
  await prisma.user_roles.createMany({
    data: [
      { user_id: managerUser.id, role_id: managerRole.id },
      { user_id: limitedUser.id, role_id: limitedRole.id },
    ],
  });
  await prisma.user_access_scopes.createMany({
    data: [
      { user_id: managerUser.id, scope: "ALL" },
      { user_id: limitedUser.id, scope: "READ_ONLY" },
    ],
  });
}

async function cleanupStaleFixtures() {
  const [users, roles, departments] = await Promise.all([
    prisma.users.findMany({
      where: {
        email: {
          in: [managerEmail, limitedEmail, managedEmail],
        },
      },
      select: { id: true },
    }),
    prisma.roles.findMany({
      where: { code: { startsWith: "INTEGRATION_" } },
      select: { id: true },
    }),
    prisma.departments.findMany({
      where: { code: { startsWith: "INT-SCOPE-" } },
      select: { id: true },
    }),
  ]);
  const roleIds = roles.map((role) => role.id);
  const departmentIds = departments.map((department) => department.id);
  const [roleUsers, departmentUsers, departmentManagers] = await Promise.all([
    prisma.user_roles.findMany({
      where: { role_id: { in: roleIds } },
      select: { user_id: true },
    }),
    prisma.user_departments.findMany({
      where: { department_id: { in: departmentIds } },
      select: { user_id: true },
    }),
    prisma.departments.findMany({
      where: { id: { in: departmentIds } },
      select: { manager_id: true },
    }),
  ]);
  const userIds = [
    ...new Set([
      ...users.flatMap((user) => [user.id]),
      ...roleUsers.flatMap((assignment) => (assignment.user_id ? [assignment.user_id] : [])),
      ...departmentUsers.flatMap((membership) => (membership.user_id ? [membership.user_id] : [])),
      ...departmentManagers.flatMap((department) => (department.manager_id ? [department.manager_id] : [])),
    ]),
  ];
  if (userIds.length === 0 && roleIds.length === 0 && departmentIds.length === 0) return;

  await prisma.$transaction([
    prisma.audit_logs.deleteMany({
      where: {
        OR: [
          { user_id: { in: userIds } },
          { entity_id: { in: [...userIds, ...roleIds, ...departmentIds] } },
        ],
      },
    }),
    prisma.user_access_scopes.deleteMany({ where: { user_id: { in: userIds } } }),
    prisma.user_departments.deleteMany({
      where: {
        OR: [
          { user_id: { in: userIds } },
          { department_id: { in: departmentIds } },
        ],
      },
    }),
    prisma.user_roles.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { role_id: { in: roleIds } }] } }),
    prisma.departments.deleteMany({ where: { id: { in: departmentIds } } }),
    prisma.users.deleteMany({ where: { id: { in: userIds } } }),
    prisma.role_access_scopes.deleteMany({ where: { role_id: { in: roleIds } } }),
    prisma.role_permissions.deleteMany({ where: { role_id: { in: roleIds } } }),
    prisma.roles.deleteMany({ where: { id: { in: roleIds } } }),
  ]);
}

async function ensureAccessScopes() {
  await prisma.access_scopes.createMany({
    data: [
      { code: "ALL", name: "Toàn hệ thống", description: "Xem dữ liệu toàn hệ thống.", is_active: true },
      { code: "DEPARTMENT", name: "Theo phòng ban", description: "Giới hạn theo phòng ban.", is_active: true },
      { code: "ASSIGNED_ONLY", name: "Dữ liệu được giao", description: "Chỉ xem dữ liệu được giao.", is_active: true },
      { code: "OWNED_ONLY", name: "Dữ liệu tự tạo", description: "Chỉ xem dữ liệu tự tạo.", is_active: true },
      { code: "READ_ONLY", name: "Chỉ xem", description: "Chỉ đọc dữ liệu.", is_active: true },
    ],
    skipDuplicates: true,
  });
}

async function ensurePermissions(codes: string[]) {
  const existing = await prisma.permissions.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const permissionIds = new Map(existing.map((permission) => [permission.code, permission.id]));
  for (const code of codes) {
    if (permissionIds.has(code)) continue;
    const permission = await prisma.permissions.create({
      data: {
        code,
        name: code,
        module: code.split(".")[0] ?? "system",
        description: "Temporary permission created by access-control integration test.",
        is_active: true,
      },
      select: { id: true },
    });
    permissionIds.set(code, permission.id);
    createdPermissionIds.push(permission.id);
  }
  return permissionIds;
}

async function verifyUserRoleScopeManagement() {
  await preparePrincipal();
  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server!.once("listening", resolve);
    server!.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  assert.equal((await request(baseUrl, "/users")).status, 401);
  const limitedLogin = await login(baseUrl, limitedEmail, limitedPassword);
  assert.equal((await request(baseUrl, "/users", { token: limitedLogin.accessToken as string })).status, 403);

  const managerLogin = await login(baseUrl, managerEmail, managerPassword);
  const managerToken = managerLogin.accessToken as string;
  const managerUser = managerLogin.user as { accessScope: AccessScope; permissions: string[]; institutionProgramIds: string[] };
  assert.equal(managerUser.accessScope, "ALL");
  assert.deepEqual(managerUser.institutionProgramIds, [programId]);
  assert.ok(managerUser.permissions.includes("user.manage"));
  assert.ok(managerUser.permissions.includes("role.manage"));

  const scopesResponse = await request(baseUrl, "/roles/scopes", { token: managerToken });
  assert.equal(scopesResponse.status, 200);
  const scopes = scopesResponse.payload.data as Array<{ code: AccessScope; name: string; description: string | null; isActive: boolean }>;
  originalOwnedOnlyScope = scopes.find((scope) => scope.code === "OWNED_ONLY") ?? null;
  assert.ok(originalOwnedOnlyScope, "OWNED_ONLY scope must exist.");

  assert.equal(
    (await request(baseUrl, "/roles/scopes/OWNED_ONLY", {
      token: managerToken,
      method: "PATCH",
      body: { name: "Dữ liệu tự tạo", description: "Tạm tắt bởi integration test.", isActive: false },
    })).status,
    200,
  );

  await ensurePermissions(["lead.view_department", "report.view"]);
  const roleOptions = await request(baseUrl, "/roles/options", { token: managerToken });
  assert.equal(roleOptions.status, 200);
  const rolePermissions = roleOptions.payload.permissions as Array<{ id: string; code: string }>;
  const rolePrograms = roleOptions.payload.programs as Array<{ id: string }>;
  const leadViewDepartment = rolePermissions.find((permission) => permission.code === "lead.view_department");
  const reportView = rolePermissions.find((permission) => permission.code === "report.view");
  assert.ok(leadViewDepartment, "Missing lead.view_department permission option.");
  assert.ok(rolePrograms.some((program) => program.id === programId), "Missing assigned institution program option.");

  assert.equal(
    (await request(baseUrl, "/roles", {
      token: managerToken,
      method: "POST",
      body: {
        name: "Inactive scope role",
        code: `${roleCode}_INACTIVE`,
        description: "Should be rejected because OWNED_ONLY is inactive.",
        scopeCode: "OWNED_ONLY",
        permissionIds: [leadViewDepartment.id],
        programIds: [programId],
      },
    })).status,
    400,
  );

  assert.equal(
    (await request(baseUrl, "/roles/scopes/OWNED_ONLY", {
      token: managerToken,
      method: "PATCH",
      body: {
        name: originalOwnedOnlyScope.name,
        description: originalOwnedOnlyScope.description ?? "",
        isActive: originalOwnedOnlyScope.isActive,
      },
    })).status,
    200,
  );

  assert.equal(
    (await request(baseUrl, "/roles", {
      token: managerToken,
      method: "POST",
      body: {
        name: "Role without program",
        code: `${roleCode}_NO_PROGRAM`,
        scopeCode: "DEPARTMENT",
        permissionIds: [],
        programIds: [],
      },
    })).status,
    400,
    "A role must have at least one institution program.",
  );

  const createRole = await request(baseUrl, "/roles", {
    token: managerToken,
    method: "POST",
    body: {
      name: "Integration Managed Scope Role",
      code: roleCode.toLowerCase(),
      description: "Created by integration test.",
      scopeCode: "DEPARTMENT",
      permissionIds: [leadViewDepartment.id],
      programIds: [programId],
    },
  });
  assert.equal(createRole.status, 201);
  managedRoleId = createRole.payload.id as string;

  assert.equal(
    (await request(baseUrl, "/roles", {
      token: managerToken,
      method: "POST",
      body: {
        name: "Duplicate Integration Role",
        code: roleCode,
        scopeCode: "DEPARTMENT",
        permissionIds: [],
        programIds: [programId],
      },
    })).status,
    409,
  );

  const rolesResponse = await request(baseUrl, "/roles", { token: managerToken });
  assert.equal(rolesResponse.status, 200);
  const roles = rolesResponse.payload.data as Array<{ id: string; code: string; scopeCode: AccessScope; permissions: Array<{ code: string }>; programs: Array<{ id: string }> }>;
  const createdRole = roles.find((role) => role.id === managedRoleId);
  assert.equal(createdRole?.code, roleCode);
  assert.equal(createdRole?.scopeCode, "DEPARTMENT");
  assert.ok(createdRole?.permissions.some((permission) => permission.code === "lead.view_department"));
  assert.deepEqual(createdRole?.programs.map((program) => program.id), [programId]);

  const departmentResponse = await request(baseUrl, "/departments", {
    token: managerToken,
    method: "POST",
    body: {
      name: `Phòng kiểm thử scope ${runId}`,
      code: departmentCode,
      managerId: managerUserId,
      memberIds: [managerUserId],
    },
  });
  assert.equal(departmentResponse.status, 201);
  departmentId = departmentResponse.payload.id as string;

  const createUser = await request(baseUrl, "/users", {
    token: managerToken,
    method: "POST",
    body: {
      fullName: "Integration Managed User",
      email: managedEmail,
      phone: "0907654321",
      status: "active",
      password: managedPassword,
      roleIds: [managedRoleId],
      departmentIds: [departmentId],
      accessScope: "ASSIGNED_ONLY",
    },
  });
  assert.equal(createUser.status, 201);
  managedUserId = createUser.payload.id as string;

  assert.equal(
    (await request(baseUrl, "/users", {
      token: managerToken,
      method: "POST",
      body: {
        fullName: "Duplicate Managed User",
        email: managedEmail,
        status: "active",
        password: managedPassword,
        roleIds: [],
        departmentIds: [],
        accessScope: "READ_ONLY",
      },
    })).status,
    409,
  );

  const managedLogin = await login(baseUrl, managedEmail, managedPassword);
  const managedAuthUser = managedLogin.user as { accessScope: AccessScope; permissions: string[]; departmentIds: string[] };
  assert.equal(managedAuthUser.accessScope, "ASSIGNED_ONLY", "User access scope must override the role scope.");
  assert.ok(managedAuthUser.permissions.includes("lead.view_department"));
  assert.deepEqual(managedAuthUser.departmentIds, [departmentId]);

  const usersResponse = await request(
    baseUrl,
    `/users?page=1&limit=20&search=${encodeURIComponent("Integration Managed User")}&roleId=${managedRoleId}&departmentId=${departmentId}`,
    { token: managerToken },
  );
  assert.equal(usersResponse.status, 200);
  const users = usersResponse.payload.data as Array<{
    id: string;
    email: string;
    accessScope: AccessScope;
    roles: Array<{ id: string; code: string }>;
    departments: Array<{ id: string; code: string | null }>;
  }>;
  const listedUser = users.find((user) => user.id === managedUserId);
  assert.equal(listedUser?.email, managedEmail);
  assert.equal(listedUser?.accessScope, "ASSIGNED_ONLY");
  assert.ok(listedUser?.roles.some((role) => role.id === managedRoleId && role.code === roleCode));
  assert.ok(listedUser?.departments.some((department) => department.id === departmentId && department.code === departmentCode));

  assert.equal(
    (await request(baseUrl, `/roles/${managedRoleId}`, { token: managerToken, method: "DELETE" })).status,
    409,
    "A role assigned to a user must not be deletable.",
  );

  assert.ok(reportView, "Missing report.view permission option.");
  const updateRole = await request(baseUrl, `/roles/${managedRoleId}`, {
    token: managerToken,
    method: "PATCH",
    body: {
      name: "Integration Managed Scope Role Updated",
      code: roleCode,
      description: "Updated by integration test.",
      scopeCode: "READ_ONLY",
      permissionIds: [reportView.id],
      programIds: [programId],
    },
  });
  assert.equal(updateRole.status, 200);

  const updateUser = await request(baseUrl, `/users/${managedUserId}`, {
    token: managerToken,
    method: "PATCH",
    body: {
      fullName: "Integration Managed User Updated",
      email: managedEmail,
      phone: "0907654322",
      status: "active",
      roleIds: [managedRoleId],
      departmentIds: [departmentId],
      accessScope: "READ_ONLY",
    },
  });
  assert.equal(updateUser.status, 200);

  const updatedManagedLogin = await login(baseUrl, managedEmail, managedPassword);
  const updatedManagedAuthUser = updatedManagedLogin.user as { accessScope: AccessScope; permissions: string[] };
  assert.equal(updatedManagedAuthUser.accessScope, "READ_ONLY");
  assert.ok(updatedManagedAuthUser.permissions.includes("report.view"));
  assert.ok(!updatedManagedAuthUser.permissions.includes("lead.view_department"));

  const auditCount = await prisma.audit_logs.count({
    where: {
      OR: [
        { entity_type: "role", entity_id: managedRoleId },
        { entity_type: "user", entity_id: managedUserId },
        { entity_type: "department", entity_id: departmentId },
        { entity_type: "access_scope" },
      ],
      user_id: managerUserId,
    },
  });
  assert.ok(auditCount >= 5, "Management actions must create audit logs.");

  console.log("User/role/scope management integration verified: authz, role scope, inactive scope guard, user access-scope override, department membership, duplicate handling and audit logs.");
}

async function cleanup() {
  if (originalOwnedOnlyScope) {
    await prisma.access_scopes.update({
      where: { code: "OWNED_ONLY" },
      data: {
        name: originalOwnedOnlyScope.name,
        description: originalOwnedOnlyScope.description,
        is_active: originalOwnedOnlyScope.isActive,
        updated_at: new Date(),
      },
    }).catch(() => undefined);
  }

  const userIds = [managerUserId, limitedUserId, managedUserId].flatMap((id) => (id ? [id] : []));
  const roleIds = [managerRoleId, limitedRoleId, managedRoleId].flatMap((id) => (id ? [id] : []));
  const departmentIds = departmentId ? [departmentId] : [];

  await prisma.$transaction([
    prisma.audit_logs.deleteMany({
      where: {
        OR: [
          { user_id: { in: userIds } },
          { entity_id: { in: [...userIds, ...roleIds, ...departmentIds] } },
          { entity_type: "access_scope", user_id: managerUserId ?? undefined },
        ],
      },
    }),
    prisma.user_access_scopes.deleteMany({ where: { user_id: { in: userIds } } }),
    prisma.user_departments.deleteMany({
      where: {
        OR: [
          { user_id: { in: userIds } },
          { department_id: { in: departmentIds } },
        ],
      },
    }),
    prisma.user_roles.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { role_id: { in: roleIds } }] } }),
    prisma.departments.deleteMany({ where: { id: { in: departmentIds } } }),
    prisma.users.deleteMany({ where: { id: { in: userIds } } }),
    prisma.role_access_scopes.deleteMany({ where: { role_id: { in: roleIds } } }),
    prisma.role_permissions.deleteMany({ where: { role_id: { in: roleIds } } }),
    prisma.roles.deleteMany({ where: { id: { in: roleIds } } }),
    prisma.permissions.deleteMany({ where: { id: { in: createdPermissionIds } } }),
  ]);
}

verifyUserRoleScopeManagement()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await cleanup();
    await prisma.$disconnect();
  });
