import assert from "node:assert/strict";
import { test } from "node:test";
import { assertFileTarget } from "./private-file-access";
import type { AuthUser } from "../auth/auth.types";

const program = "11111111-1111-4111-8111-111111111111";
const actor: AuthUser = { id: "22222222-2222-4222-8222-222222222222", email: "fixture@example.test", fullName: "Fixture", avatarUrl: null, roles: [], permissions: ["lead.view_all", "file.upload"], institutionProgramIds: [program], departmentIds: [], accessScope: "ALL" };
const target = { domain: "lead" as const, leadId: "33333333-3333-4333-8333-333333333333", programId: program };
test("private file routes retain enrolled-student view/write gates from the lead router", async () => {
  const db = { leads: { findFirst: async () => ({ id: target.leadId }) }, students: { findFirst: async () => ({ id: "student" }) } } as unknown as Parameters<typeof assertFileTarget>[3];
  await assert.rejects(assertFileTarget(actor, target, false, db), /học viên/);
  await assertFileTarget({ ...actor, permissions: [...actor.permissions, "student.view"] }, target, false, db);
  await assert.rejects(assertFileTarget({ ...actor, permissions: [...actor.permissions, "student.view"] }, target, true, db), /học viên/);
  await assertFileTarget({ ...actor, permissions: [...actor.permissions, "student.view", "student.update"] }, target, true, db);
});
test("read-only or wrong-program users cannot mutate managed attachments", async () => {
  await assert.rejects(assertFileTarget({ ...actor, accessScope: "READ_ONLY" }, target, true), /chỉ được xem/);
  await assert.rejects(assertFileTarget({ ...actor, institutionProgramIds: [] }, target, false), /chương trình/);
});
