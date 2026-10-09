import assert from "node:assert/strict";
import { prisma } from "../database/prisma";
import { customFieldPermissionDefinitions, customFieldPermissionActions } from "../modules/custom-fields/custom-field-permissions";

async function main() {
  for (const expected of customFieldPermissionDefinitions) {
    const actual = await prisma.permissions.findUnique({ where: { code: expected.code }, select: { module: true, is_active: true } });
    assert.equal(actual?.module, expected.module, expected.code);
    assert.equal(actual?.is_active, true, expected.code);
  }
  for (const code of ["admission_major.manage", "institution_program.manage"]) {
    assert.equal((await prisma.permissions.findUnique({ where: { code } }))?.module, "system");
  }
  const legacyCodes = Object.keys(customFieldPermissionActions).map((action) => `custom_field.${action}`);
  assert.equal(await prisma.permissions.count({ where: { code: { in: legacyCodes }, is_active: true } }), 0);
  assert.equal(await prisma.role_permissions.count({ where: { permissions: { code: { in: legacyCodes } } } }), 0);
  const retired = await prisma.permissions.findMany({ where: { code: { startsWith: "custom_field." }, NOT: { code: { in: customFieldPermissionDefinitions.map((item) => item.code) } } }, select: { id: true, is_active: true } });
  assert.ok(retired.every((item) => item.is_active === false));
  assert.equal(await prisma.role_permissions.count({ where: { permission_id: { in: retired.map((item) => item.id) } } }), 0);
  assert.equal(customFieldPermissionDefinitions.length, 9);
  console.log("Database: 9 form-management permissions, no major configuration and no granular grants verified.");
}
main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
