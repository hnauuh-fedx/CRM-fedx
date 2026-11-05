import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { getAuthUser } from "../modules/auth/auth.service";
import { createInstitutionProgram, deleteInstitutionProgram } from "../modules/institutions/institution-program-management.service";

async function main() {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname), "Use a local test database.");
  const prefix = "PROGRAM_CREATOR_" + randomUUID().slice(0, 8);
  const workingProgramId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  let createdProgramId: string | undefined;
  try {
    await prisma.institution_programs.create({ data: { id: workingProgramId, code: prefix + "_WORK", name: "Chương trình gốc", institution_name: "Trường kiểm thử" } });
    await prisma.roles.create({ data: { id: roleId, code: prefix, name: "Vai trò kiểm thử" } });
    await prisma.role_institution_programs.create({ data: { role_id: roleId, institution_program_id: workingProgramId } });
    await prisma.users.create({ data: { id: userId, full_name: "Quản trị kiểm thử", email: prefix.toLowerCase() + "@example.test", password_hash: "unused" } });
    await prisma.user_program_roles.create({ data: { user_id: userId, institution_program_id: workingProgramId, role_id: roleId } });
    await prisma.user_program_access_scopes.create({ data: { user_id: userId, institution_program_id: workingProgramId, scope: "DEPARTMENT" } });

    const actor = (await getAuthUser(userId, workingProgramId))!;
    const created = await createInstitutionProgram(actor, { institutionName: "Trường kiểm thử", name: "Chương trình mới " + prefix, code: prefix + "_NEW", status: "active" });
    assert.ok(created.ok);
    createdProgramId = created.data.id;

    const after = (await getAuthUser(userId, createdProgramId))!;
    assert.ok(after.institutionProgramIds.includes(createdProgramId), "Creator can select the new program");
    assert.deepEqual(after.roles, [prefix], "Creator keeps the working-program role");
    assert.equal(after.accessScope, "DEPARTMENT", "Creator keeps the working-program access scope");

    const deleted = await deleteInstitutionProgram(actor, createdProgramId);
    assert.ok(deleted.ok, "Unused program with access grants can be deleted");
    assert.equal(await prisma.institution_programs.count({ where: { id: createdProgramId } }), 0);
    assert.equal(await prisma.user_program_roles.count({ where: { institution_program_id: createdProgramId } }), 0);
    assert.equal(await prisma.role_institution_programs.count({ where: { institution_program_id: createdProgramId } }), 0);
    createdProgramId = undefined;
    console.log("PASS: creator receives program access on create; delete removes access grants.");
  } finally {
    const programIds = [workingProgramId, ...(createdProgramId ? [createdProgramId] : [])];
    await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: userId }, { entity_id: { in: programIds } }] } });
    await prisma.users.deleteMany({ where: { id: userId } });
    await prisma.role_institution_programs.deleteMany({ where: { role_id: roleId } });
    await prisma.roles.deleteMany({ where: { id: roleId } });
    await prisma.institution_programs.deleteMany({ where: { id: { in: programIds } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
