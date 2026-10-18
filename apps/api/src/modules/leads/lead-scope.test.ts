import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "./lead-list.service";

const departmentManager: AuthUser = {
  id: "manager-1",
  email: "manager@example.test",
  fullName: "Sale Manager",
  avatarUrl: null,
  roles: ["SALE_MANAGER"],
  permissions: ["lead.view_department"],
  departmentIds: ["department-1"],
  institutionProgramIds: ["program-1"],
  accessScope: "DEPARTMENT",
};

describe("lead scope", () => {
  it("includes the selected program's unassigned pool for department managers", () => {
    assert.deepEqual(getLeadScopeWhere(departmentManager, "program-1"), {
      OR: [
        {
          lead_assignments: {
            some: {
              department_id: { in: ["department-1"] },
              is_main_owner: true,
            },
          },
        },
        {
          institution_program_id: "program-1",
          assigned_to: null,
          lead_assignments: { none: { is_main_owner: true } },
        },
      ],
    });
  });

  it("does not expose an unassigned pool without a selected program", () => {
    assert.deepEqual(getLeadScopeWhere(departmentManager), {
      lead_assignments: {
        some: {
          department_id: { in: ["department-1"] },
          is_main_owner: true,
        },
      },
    });
  });

  it("does not expose an unassigned pool for an unauthorized program", () => {
    assert.deepEqual(getLeadScopeWhere(departmentManager, "program-other"), {
      lead_assignments: {
        some: {
          department_id: { in: ["department-1"] },
          is_main_owner: true,
        },
      },
    });
  });
});

for (const scope of ["DEPARTMENT", "ALL", "OWNED_ONLY"] as const) {
  it(`assigned-only permission cannot expand through ${scope} scope`, () => {
    const salesperson: AuthUser = { ...departmentManager, id: "sale-1", accessScope: scope, permissions: ["lead.view_assigned"], roles: ["CUSTOM_SALE"] };
    assert.deepEqual(getLeadScopeWhere(salesperson, "program-1"), {
      OR: [
        { assigned_to: "sale-1" },
        { secondary_assigned_to: "sale-1" },
        { lead_assignments: { some: { assigned_to: "sale-1", is_main_owner: true } } },
      ],
    });
  });
}
it("an explicit assigned scope restricts a department permission", () => {
  const salesperson: AuthUser = { ...departmentManager, accessScope: "ASSIGNED_ONLY" };
  assert.deepEqual(getLeadScopeWhere(salesperson, "program-1"), {
    OR: [
      { assigned_to: salesperson.id },
      { secondary_assigned_to: salesperson.id },
      { lead_assignments: { some: { assigned_to: salesperson.id, is_main_owner: true } } },
    ],
  });
});
it("does not infer lead visibility without a permission", () => {
  assert.deepEqual(getLeadScopeWhere({ ...departmentManager, permissions: [] }, "program-1"), { id: "00000000-0000-4000-8000-000000000000" });
});
