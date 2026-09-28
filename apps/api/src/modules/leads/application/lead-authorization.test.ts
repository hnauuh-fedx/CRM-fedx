import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthUser } from "../../auth/auth.types";
import {
  canAssignLead,
  canCreateLead,
  canUseAssignmentDepartment,
  canUpdateLead,
  isAssigneeInScope,
} from "./lead-authorization";

function actor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "actor-1",
    email: "actor@example.test",
    fullName: "Actor",
    avatarUrl: null,
    roles: [],
    permissions: [],
    departmentIds: [],
    institutionProgramIds: [],
    accessScope: "ASSIGNED_ONLY",
    ...overrides,
  };
}

describe("lead authorization", () => {
  it("requires explicit create, assign, and update permissions", () => {
    const authorized = actor({
      permissions: ["lead.create", "lead.assign", "lead.update_department"],
    });
    const unauthorized = actor();

    assert.equal(canCreateLead(authorized), true);
    assert.equal(canAssignLead(authorized), true);
    assert.equal(canUpdateLead(authorized), true);
    assert.equal(canCreateLead(unauthorized), false);
    assert.equal(canAssignLead(unauthorized), false);
    assert.equal(canUpdateLead(unauthorized), false);
  });

  it("limits assignees to a department visible to the actor", () => {
    const departmentActor = actor({
      accessScope: "DEPARTMENT",
      departmentIds: ["department-visible"],
    });

    assert.equal(
      isAssigneeInScope(departmentActor, [
        { department_id: "department-visible" },
      ]),
      true,
    );
    assert.equal(
      isAssigneeInScope(departmentActor, [
        { department_id: "department-other" },
      ]),
      false,
    );
  });

  it("allows all-scope actors only when lead.view_all is explicit", () => {
    const memberships = [{ department_id: "department-other" }];

    assert.equal(
      isAssigneeInScope(
        actor({ accessScope: "ALL", permissions: ["lead.view_all"] }),
        memberships,
      ),
      true,
    );
    assert.equal(
      isAssigneeInScope(actor({ accessScope: "ALL" }), memberships),
      false,
    );
  });

  it("rejects an explicitly requested department outside actor scope", () => {
    const departmentActor = actor({
      accessScope: "DEPARTMENT",
      departmentIds: ["department-visible"],
    });

    assert.equal(
      canUseAssignmentDepartment(departmentActor, "department-visible"),
      true,
    );
    assert.equal(
      canUseAssignmentDepartment(departmentActor, "department-other"),
      false,
    );
    assert.equal(
      canUseAssignmentDepartment(
        actor({ accessScope: "ALL", permissions: ["lead.view_all"] }),
        "department-other",
      ),
      true,
    );
  });
});
