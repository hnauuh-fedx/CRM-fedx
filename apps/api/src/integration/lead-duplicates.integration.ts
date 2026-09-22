import assert from "node:assert/strict";

import { prisma } from "../database/prisma";
import type { AuthUser } from "../modules/auth/auth.types";
import { listDuplicateGroupMembers, listDuplicateLeads } from "../modules/leads/lead-duplicates.service";

const user: AuthUser = {
  id: "00000000-0000-4000-8000-000000000000",
  email: "",
  fullName: "",
  avatarUrl: null,
  roles: [],
  permissions: ["lead.view_all", "lead.sensitive.view"],
  departmentIds: [],
  institutionProgramIds: [],
  accessScope: "ALL",
};

async function main() {
  for (const field of ["fullName", "phone", "email"] as const) {
    const result = await listDuplicateLeads(user, { field, page: 1, limit: 2 });
    assert.ok(result.data.length <= 2);
    for (const group of result.data) {
      assert.ok(group.key.length > 0);
      assert.ok(group.count > 1);
      assert.ok(group.leads.length > 0 && group.leads.length <= 5);
      const members = await listDuplicateGroupMembers(user, { field, key: group.key, page: 1, limit: 2 });
      assert.equal(members.pagination.total, group.count);
      assert.ok(members.data.length > 0 && members.data.length <= 2);
    }
  }
  const noAccess = await listDuplicateLeads({ ...user, permissions: ["lead.view_assigned"], accessScope: "ASSIGNED_ONLY" }, {
    field: "fullName", page: 1, limit: 2,
  });
  assert.equal(noAccess.pagination.total, 0);
  console.log("Lead duplicate checks passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
