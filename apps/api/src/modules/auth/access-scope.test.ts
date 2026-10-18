import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEffectiveAccessScope } from "@admission-crm/shared/access-scope";

test("inherits the role scope when a user has no override", () => {
  assert.equal(resolveEffectiveAccessScope("ASSIGNED_ONLY"), "ASSIGNED_ONLY");
  assert.equal(resolveEffectiveAccessScope("OWNED_ONLY", null), "OWNED_ONLY");
});
test("a private override cannot expand an assigned or owned role", () => {
  for (const override of ["ALL", "DEPARTMENT", "OWNED_ONLY"] as const) {
    assert.equal(resolveEffectiveAccessScope("ASSIGNED_ONLY", override), "ASSIGNED_ONLY");
  }
  assert.equal(resolveEffectiveAccessScope("OWNED_ONLY", "ASSIGNED_ONLY"), "OWNED_ONLY");
  assert.equal(resolveEffectiveAccessScope("READ_ONLY", "ALL"), "READ_ONLY");
});
test("preserves narrower supported scopes for managers", () => {
  assert.equal(resolveEffectiveAccessScope("ALL", "DEPARTMENT"), "DEPARTMENT");
  assert.equal(resolveEffectiveAccessScope("DEPARTMENT", "ASSIGNED_ONLY"), "ASSIGNED_ONLY");
  assert.equal(resolveEffectiveAccessScope("ASSIGNED_ONLY", "READ_ONLY"), "READ_ONLY");
});
