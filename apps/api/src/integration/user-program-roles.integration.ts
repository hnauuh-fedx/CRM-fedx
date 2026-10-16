import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { getAuthUser, loginWithPassword } from "../modules/auth/auth.service";
import { usersRouter } from "../modules/users/users.router";
import { getUserManagementOptions } from "../modules/users/user-management.service";
import { findActiveAssignableSale } from "../modules/leads/application/lead-mutation-support";

async function main() {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname), "Use a local test database.");
  const prefix = "PROGRAM_ACCESS_" + randomUUID().slice(0, 8);
  const programIds = [randomUUID(), randomUUID(), randomUUID()];
  const roleIds = [randomUUID(), randomUUID(), randomUUID()];
  const userIds = [randomUUID(), randomUUID()];
  const managedEmail = prefix.toLowerCase() + "@example.test";
  const app = express(); app.use(express.json()); app.use("/users", usersRouter);
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  try {
    const permissions = await prisma.permissions.findMany({ where: { code: { in: ["user.manage", "lead.view_assigned", "report.view"] }, is_active: true }, select: { id: true, code: true } });
    const permission = (code: string) => { const item = permissions.find((p) => p.code === code); assert.ok(item, code); return item.id; };
    await prisma.institution_programs.createMany({ data: programIds.map((id, i) => ({ id, code: prefix + i, name: "Chương trình kiểm thử " + i, institution_name: "Trường kiểm thử" })) });
    await prisma.roles.createMany({ data: roleIds.map((id, i) => ({ id, code: prefix + i, name: "Vai trò kiểm thử " + i })) });
    await prisma.role_institution_programs.createMany({ data: [
      { role_id: roleIds[0]!, institution_program_id: programIds[0]! }, { role_id: roleIds[0]!, institution_program_id: programIds[1]! },
      { role_id: roleIds[1]!, institution_program_id: programIds[0]! }, { role_id: roleIds[1]!, institution_program_id: programIds[1]! },
      { role_id: roleIds[2]!, institution_program_id: programIds[2]! },
    ] });
    await prisma.role_permissions.createMany({ data: [
      { role_id: roleIds[0]!, permission_id: permission("user.manage") },
      { role_id: roleIds[1]!, permission_id: permission("lead.view_assigned") },
      { role_id: roleIds[2]!, permission_id: permission("report.view") },
    ] });
    await prisma.users.create({ data: { id: userIds[0]!, full_name: "Quản trị kiểm thử", email: "actor." + managedEmail, password_hash: "unused" } });
    await prisma.user_program_roles.createMany({ data: programIds.map((id, i) => ({ user_id: userIds[0]!, institution_program_id: id, role_id: i === 2 ? roleIds[2]! : roleIds[0]! })) });
    const actor = (await getAuthUser(userIds[0]! , programIds[0]!))!;
    const options = await getUserManagementOptions(programIds[0]!, actor);
    assert.deepEqual(options.programs.map((p) => p.id).sort(), programIds.slice(0, 2).sort(), "Read-only program must not be manageable");
    const token = jwt.sign({ sub: actor.id, type: "access" }, env.JWT_SECRET);
    async function request(path: string, body?: object, programId = programIds[0]!, method = "POST") {
      const response = await fetch(base + path, { method, headers: { "content-type": "application/json", authorization: "Bearer " + token, "x-institution-program-id": programId }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() };
    }
    const input = { fullName: "Người dùng kiểm thử", email: managedEmail, phone: "", status: "active", password: "TestPassword123", accessScope: "ASSIGNED_ONLY", departmentIds: [],
      programAssignments: [{ institutionProgramId: programIds[0]!, roleId: roleIds[1]! }, { institutionProgramId: programIds[1]!, roleId: roleIds[0]! }] };
    assert.equal((await request("/users", { ...input, programAssignments: [{ institutionProgramId: programIds[0]! }] })).status, 400, "Missing role");
    assert.equal((await request("/users", { ...input, programAssignments: [input.programAssignments[0], input.programAssignments[0]] })).status, 400, "Duplicate program");
    assert.equal((await request("/users", { ...input, programAssignments: [{ institutionProgramId: programIds[0]!, roleId: roleIds[2]! }] })).status, 400, "Wrong program role");
    assert.equal((await request("/users", { ...input, programAssignments: [{ institutionProgramId: programIds[2]!, roleId: roleIds[2]! }] })).status, 403, "No management permission in selected program");
    assert.equal((await request("/users", input, programIds[2]!)).status, 403, "Read-only actor cannot write");
    const created = await request("/users", input); assert.equal(created.status, 201);
    userIds[1] = created.body.id;
    await prisma.user_roles.create({ data: { user_id: userIds[1]!, role_id: roleIds[0]! } });
    await prisma.role_institution_programs.create({ data: { role_id: roleIds[0]!, institution_program_id: programIds[2]! } });
    assert.ok(!(await getAuthUser(userIds[1]!))!.institutionProgramIds.includes(programIds[2]!), "Catalog expansion and legacy roles never grant program access");
    const first = (await getAuthUser(userIds[1]!, programIds[0]!))!;
    const second = (await getAuthUser(userIds[1]!, programIds[1]!))!;
    assert.deepEqual(first.roles, [prefix + "1"]); assert.ok(!first.permissions.includes("user.manage"));
    assert.deepEqual(second.roles, [prefix + "0"]); assert.ok(second.permissions.includes("user.manage"));
    assert.equal((await findActiveAssignableSale(prisma, userIds[1]!, undefined, programIds[0]!))?.id, userIds[1]);
    assert.equal(await findActiveAssignableSale(prisma, userIds[1]!, undefined, programIds[1]!), null, "Different role in second program cannot receive telesale assignment");
    // Hidden grant is intentionally outside actor's management permission.
    await prisma.user_program_roles.create({ data: { user_id: userIds[1]!, institution_program_id: programIds[2]!, role_id: roleIds[2]! } });
    const list = await request("/users?search=" + prefix, undefined, programIds[0]!, "GET");
    assert.equal(list.status, 200); assert.ok(list.body.data.every((u: { programAssignments: Array<{ institutionProgramId: string }> }) => u.programAssignments.every((p) => p.institutionProgramId !== programIds[2])));
    const updated = await request("/users/" + userIds[1], { ...input, password: "", programAssignments: [input.programAssignments[0]] }, programIds[0]!, "PATCH"); assert.equal(updated.status, 200);
    const after = (await getAuthUser(userIds[1]!, programIds[1]!))!;
    assert.ok(!after.institutionProgramIds.includes(programIds[1]!)); assert.deepEqual(after.permissions, []);
    assert.ok(after.institutionProgramIds.includes(programIds[2]!), "Preserve hidden grant");
    const login = await loginWithPassword(managedEmail, "TestPassword123", undefined, programIds[1]!);
    assert.ok(login && login.user.workingInstitutionProgramId && login.user.institutionProgramIds.includes(login.user.workingInstitutionProgramId), "Login recovers from a revoked saved program");
    const managedToken = jwt.sign({ sub: userIds[1], type: "access" }, env.JWT_SECRET);
    assert.equal((await fetch(base + "/users", { headers: { authorization: "Bearer " + managedToken, "x-institution-program-id": programIds[1]! } })).status, 403, "Revocation affects existing token");
    await assert.rejects(prisma.user_program_roles.create({ data: { user_id: userIds[1]!, institution_program_id: programIds[0]!, role_id: roleIds[0]! } }), "DB rejects second role");
    await assert.rejects(prisma.user_program_roles.create({ data: { user_id: userIds[1]!, institution_program_id: programIds[1]!, role_id: roleIds[2]! } }), "DB rejects role outside catalog");
    assert.equal(await prisma.audit_logs.count({ where: { entity_id: userIds[1], entity_type: "user", action: { in: ["create", "update"] } } }), 2);
    console.log("PASS: one role/program, role validation, per-program permissions, options/list scope, assignment eligibility, hidden grant preservation, revocation, database constraints and audits.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { entity_id: { in: userIds } }] } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role_institution_programs.deleteMany({ where: { role_id: { in: roleIds } } });
    await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.institution_programs.deleteMany({ where: { id: { in: programIds } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
