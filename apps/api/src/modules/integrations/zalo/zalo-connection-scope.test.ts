import assert from "node:assert/strict";
import test from "node:test";

import type { AuthUser } from "../../auth/auth.types";
import { zaloConnectionScope } from "./zalo-connection-scope";

const connectionScope = (authUser: AuthUser) => zaloConnectionScope(authUser, "123");

const programA = "11111111-1111-4111-8111-111111111111";
const programB = "22222222-2222-4222-8222-222222222222";
const noProgram = "00000000-0000-0000-0000-000000000000";

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    email: "director@example.test",
    fullName: "Director",
    avatarUrl: null,
    roles: ["DIRECTOR"],
    permissions: ["integration.manage"],
    departmentIds: [],
    institutionProgramIds: [programA, programB],
    workingInstitutionProgramId: programA,
    accessScope: "ALL",
    ...overrides,
  };
}

test("ALL scope still sees only the working program's Zalo connections", () => {
  assert.equal(connectionScope(user({})).institution_program_id, programA);
  assert.equal(connectionScope(user({ workingInstitutionProgramId: programB })).institution_program_id, programB);
});

test("the configured app ID is kept in the Zalo connection scope", () => {
  assert.equal(connectionScope(user({})).app_id, "123");
});

test("system.manage does not widen Zalo connections beyond the working program", () => {
  const scope = connectionScope(user({ permissions: ["integration.manage", "system.manage"] }));
  assert.equal(scope.institution_program_id, programA);
});

test("a missing or unassigned working program matches no Zalo connection", () => {
  assert.equal(connectionScope(user({ workingInstitutionProgramId: null })).institution_program_id, noProgram);
  assert.equal(connectionScope(user({ institutionProgramIds: [programB] })).institution_program_id, noProgram);
});
