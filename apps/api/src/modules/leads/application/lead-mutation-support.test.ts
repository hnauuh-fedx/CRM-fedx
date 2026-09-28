import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthUser } from "../../auth/auth.types";
import {
  selectAssigneeDepartment,
  toLeadData,
} from "./lead-mutation-support";

const actor: AuthUser = {
  id: "actor-1",
  email: "actor@example.test",
  fullName: "Actor",
  avatarUrl: null,
  roles: ["SALE_MANAGER"],
  permissions: ["lead.assign"],
  departmentIds: ["department-visible"],
  institutionProgramIds: [],
  accessScope: "DEPARTMENT",
};

describe("lead mutation support", () => {
  it("selects an assignee department visible to the actor", () => {
    const result = selectAssigneeDepartment(actor, [
      { department_id: "department-other" },
      { department_id: "department-visible" },
    ]);

    assert.equal(result, "department-visible");
  });

  it("honors a validated explicitly requested department", () => {
    const result = selectAssigneeDepartment(
      actor,
      [{ department_id: "department-visible" }],
      "department-requested",
    );

    assert.equal(result, "department-requested");
  });

  it("normalizes lead text without leaking form field names to persistence", () => {
    const result = toLeadData({
      fullName: "  Nguyễn Văn A  ",
      phone: " 0900000000 ",
      sourceId: "source-1",
      email: "   ",
      note: "  Cần tư vấn  ",
      institutionProgramId: "program-1",
    });

    assert.deepEqual(result, {
      full_name: "Nguyễn Văn A",
      phone: "0900000000",
      source_id: "source-1",
      institution_program_id: "program-1",
      major_id: null,
      email: null,
      gender: null,
      date_of_birth: null,
      cccd: null,
      note: "Cần tư vấn",
    });
  });
});
