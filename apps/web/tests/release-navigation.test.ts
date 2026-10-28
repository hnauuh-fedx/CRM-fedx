import assert from "node:assert/strict";
import { test } from "node:test";
import { getNavigationSections } from "../src/components/layout/navigation";
const hasRelease = (scope?: string) => JSON.stringify(getNavigationSections(["release.view"], scope)).includes("/management/releases");
test("release navigation requires both explicit view permission and global scope", () => {
  assert.equal(hasRelease("ALL"), true);
  for (const scope of [undefined, "DEPARTMENT", "OWNED_ONLY", "ASSIGNED_ONLY", "READ_ONLY"]) assert.equal(hasRelease(scope), false);
  assert.equal(JSON.stringify(getNavigationSections(["system.manage"], "ALL")).includes("/management/releases"), false);
});
