import assert from "node:assert/strict";
import test from "node:test";

import { institutionProgramBodySchema, institutionProgramQuerySchema } from "./institution-programs.router";

test("accepts an institution name stored directly on the program", () => {
  const result = institutionProgramBodySchema.safeParse({
    institutionName: "Đại học Trà Vinh",
    name: "Tuyển sinh 2026",
    code: "TVU-2026",
    status: "active",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.institutionName, "Đại học Trà Vinh");
    assert.equal("institutionId" in result.data, false);
    assert.equal("programTypeId" in result.data, false);
  }
});

test("rejects a missing institution name", () => {
  const result = institutionProgramBodySchema.safeParse({
    name: "Tuyển sinh 2026",
    code: "TVU-2026",
    status: "active",
  });

  assert.equal(result.success, false);
});

test("filters by institution name instead of relation identifiers", () => {
  const result = institutionProgramQuerySchema.safeParse({ institutionName: "Trà Vinh" });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.institutionName, "Trà Vinh");
    assert.equal("institutionId" in result.data, false);
    assert.equal("programTypeId" in result.data, false);
  }
});
