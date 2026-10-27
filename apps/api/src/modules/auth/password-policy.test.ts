import assert from "node:assert/strict";
import test from "node:test";
import { changePasswordSchema } from "@admission-crm/shared/password-policy";

test("self-service password change applies the same 8-100 character rule as user management", () => {
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "old-pass", newPassword: "12345678" }).success, true);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "old-pass", newPassword: "1234567" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "old-pass", newPassword: "x".repeat(101) }).success, false);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "", newPassword: "12345678" }).success, false);
});

test("the new password must differ from the current one", () => {
  const result = changePasswordSchema.safeParse({ currentPassword: "same-password", newPassword: "same-password" });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues.map((issue) => issue.path), [["newPassword"]]);
});
