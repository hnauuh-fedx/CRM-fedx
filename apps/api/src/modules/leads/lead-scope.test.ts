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
