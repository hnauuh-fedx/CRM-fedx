import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { getAuthUser } from "../modules/auth/auth.service";
import { listManagedUsers, updateManagedUser } from "../modules/users/user-management.service";
import { getLeadDetail, listLeads } from "../modules/leads/lead-list.service";
import { listDuplicateLeads } from "../modules/leads/lead-duplicates.service";

async function main() {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname));
  const prefix = "SCOPE_BOUND_" + randomUUID().slice(0, 8);
  const userIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const roleIds = [randomUUID(), randomUUID(), randomUUID()];
  const programIds = [randomUUID(), randomUUID()];
  const leadIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const departmentId = randomUUID();
  try {
    await prisma.institution_programs.createMany({ data: programIds.map((id, i) => ({ id, code: prefix + i, name: prefix + i, institution_name: "Trường kiểm thử" })) });
    await prisma.roles.createMany({ data: roleIds.map((id, i) => ({ id, code: prefix + i, name: prefix + i })) });
    await prisma.role_access_scopes.createMany({ data: roleIds.map((id, i) => ({ role_id: id, scope_code: i === 0 ? "ALL" : "ASSIGNED_ONLY" })) });
    const permissions = await prisma.permissions.findMany({ where: { code: { in: ["user.manage", "lead.view_all", "lead.view_assigned", "lead.sensitive.view"] }, is_active: true }, select: { id: true, code: true } });
    assert.equal(permissions.length, 4);
    await prisma.role_permissions.createMany({ data: permissions.filter((p) => ["user.manage", "lead.view_all"].includes(p.code)).map((p) => ({ role_id: roleIds[0]!, permission_id: p.id })) });
    for (const id of roleIds.slice(1)) await prisma.role_permissions.createMany({ data: permissions.filter((p) => ["lead.view_assigned", "lead.sensitive.view"].includes(p.code)).map((p) => ({ role_id: id, permission_id: p.id })) });
    await prisma.role_institution_programs.createMany({ data: roleIds.flatMap((id) => programIds.map((programId) => ({ role_id: id, institution_program_id: programId }))) });
    await prisma.users.createMany({ data: userIds.map((id, i) => ({ id, email: prefix + i + "@example.test", full_name: prefix + i, password_hash: "unused" })) });
    await prisma.user_program_roles.createMany({ data: userIds.flatMap((id, i) => programIds.map((programId, p) => ({ user_id: id, role_id: i === 0 ? roleIds[0]! : roleIds[p === 0 ? 1 : 2]!, institution_program_id: programId }))) });
    await prisma.user_program_access_scopes.createMany({ data: [
      { user_id: userIds[1]!, institution_program_id: programIds[0]!, scope: "DEPARTMENT" },
      { user_id: userIds[2]!, institution_program_id: programIds[1]!, scope: "ASSIGNED_ONLY" },
    ] });
    await prisma.user_access_scopes.createMany({ data: [
      { user_id: userIds[2]!, scope: "ALL" }, { user_id: userIds[3]!, scope: "DEPARTMENT" },
    ] });
    await prisma.departments.create({ data: { id: departmentId, code: prefix, name: prefix } });
    await prisma.user_departments.createMany({ data: userIds.map((id) => ({ user_id: id, department_id: departmentId })) });
    await prisma.leads.createMany({ data: leadIds.map((id, i) => ({ id, lead_code: prefix + i, full_name: prefix + " duplicate", phone: prefix + i,
      institution_program_id: programIds[0]!, assigned_to: i < 2 ? userIds[1]! : i === 2 ? userIds[2]! : null,
    })) });
    // One direct/imported assignment lacks history; another has a main record.
    await prisma.lead_assignments.createMany({ data: [
      { lead_id: leadIds[1]!, assigned_to: userIds[1]!, department_id: departmentId, is_main_owner: true },
      { lead_id: leadIds[2]!, assigned_to: userIds[2]!, department_id: departmentId, is_main_owner: true },
    ] });
    const actor = (await getAuthUser(userIds[0]!, programIds[0]!))!;
    const managed = await listManagedUsers({ page: 1, limit: 20, search: prefix, sortBy: "fullName", sortOrder: "asc" }, programIds[0]!, actor);
    for (const id of userIds.slice(1)) {
      const auth = (await getAuthUser(id, programIds[0]!))!;
      assert.equal(auth.accessScope, "ASSIGNED_ONLY", "Role inheritance and overrides must stay within role scope");
      assert.equal(managed.data.find((u) => u.id === id)?.accessScope, auth.accessScope, "Management display must match authentication");
    }
    const sale = (await getAuthUser(userIds[1]!, programIds[0]!))!;
    const query = { page: 1, limit: 20, institutionProgramId: programIds[0]!, sortBy: "createdAt" as const, sortOrder: "desc" as const };
    for (const user of [sale, { ...sale, accessScope: "DEPARTMENT" as const }, { ...sale, accessScope: "ALL" as const }]) {
      const list = await listLeads(user, query);
      assert.deepEqual(list.data.map((lead) => lead.id).sort(), leadIds.slice(0, 2).sort(), "Never include department peers or unassigned leads; preserve direct assignments");
      assert.equal(await getLeadDetail(user, leadIds[2]!, programIds[0]!), null);
      assert.equal(await getLeadDetail(user, leadIds[3]!, programIds[0]!), null);
      const duplicates = await listDuplicateLeads(user, { field: "fullName", page: 1, limit: 20, institutionProgramId: programIds[0]! });
      assert.equal(duplicates.data[0]?.count, 2, "Duplicate view enforces the same permission bound");
    }
    assert.equal((await listLeads((await getAuthUser(userIds[1]!, programIds[1]!))!, { ...query, institutionProgramId: programIds[1]! })).pagination.total, 0, "Empty program must not show an unassigned pool");
    const saved = await updateManagedUser(actor, userIds[1]!, { fullName: prefix + "1", email: prefix + "1@example.test", status: "active", accessScope: "ALL", departmentIds: [departmentId],
      programAssignments: programIds.map((id, i) => ({ institutionProgramId: id, roleId: roleIds[i === 0 ? 1 : 2]! })),
    }, programIds[0]!);
    assert.equal(saved.ok, true);
    assert.equal((await prisma.user_program_access_scopes.findUniqueOrThrow({ where: { user_id_institution_program_id: { user_id: userIds[1]!, institution_program_id: programIds[0]! } } })).scope, "ASSIGNED_ONLY", "Save cannot persist an expanded scope");
    console.log("PASS: displayed/effective scope parity, legacy and per-program overrides, imported and historical assignments, private lead/detail/duplicate visibility, empty-program behavior and safe scope saving.");
  } finally {
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
    await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.departments.deleteMany({ where: { id: departmentId } });
    await prisma.institution_programs.deleteMany({ where: { id: { in: programIds } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
