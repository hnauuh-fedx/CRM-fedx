import assert from "node:assert/strict";
import test from "node:test";

import { getRoleAssignableProgramWhere } from "./role-management.service";

test("program managers can assign every active program to a role", () => {
  assert.deepEqual(
    getRoleAssignableProgramWhere({
      permissions: ["role.manage", "institution_program.manage"],
      institutionProgramIds: ["program-already-assigned"],
    }),
    { status: "active" },
  );
});

test("role managers without program management stay inside their assigned programs", () => {
  assert.deepEqual(
    getRoleAssignableProgramWhere({
      permissions: ["role.manage"],
      institutionProgramIds: ["program-a", "program-b"],
    }),
    {
      status: "active",
      id: { in: ["program-a", "program-b"] },
    },
  );
});
