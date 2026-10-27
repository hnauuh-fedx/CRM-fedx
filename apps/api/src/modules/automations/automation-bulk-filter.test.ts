import assert from "node:assert/strict";
import test from "node:test";
import { automationBulkFilterSchema } from "./automation-bulk-filter";

const id = "00000000-0000-4000-8000-000000000001";
test("bulk target accepts legacy lists, deduplicates selection and accepts an empty filter", () => {
  assert.deepEqual(automationBulkFilterSchema.parse({ customerListId: id }), { customerListId: id });
  const selected = automationBulkFilterSchema.parse({ target: "selected", leadIds: [id, id] });
  assert.ok("target" in selected && selected.target === "selected");
  assert.deepEqual(selected.leadIds, [id]);
  assert.ok(automationBulkFilterSchema.safeParse({ target: "filtered", filters: {} }).success);
});
test("bulk target rejects ambiguous, empty or malformed selections and client-supplied scope", () => {
  for (const body of [
    {}, { target: "selected", leadIds: [] }, { target: "selected", leadIds: ["invalid"] },
    { target: "filtered", filters: { institutionProgramId: id } },
    { target: "filtered", filters: { page: 1, limit: 20 } },
    { target: "filtered", filters: { fromDate: "2026-10-26", toDate: "2026-01-01" } },
    { customerListId: id, target: "selected", leadIds: [] },
  ]) assert.equal(automationBulkFilterSchema.safeParse(body).success, false);
});
test("bulk filters use the existing advanced-filter contract", () => {
  const result = automationBulkFilterSchema.parse({ target: "filtered", filters: {
    search: "Lead", sourceId: "", filterConditions: JSON.stringify([{ field: "fullName", operator: "CONTAINS", value: "A" }]),
  } });
  assert.ok("target" in result && result.target === "filtered");
  assert.equal(result.filters.sourceId, undefined);
  assert.equal(result.filters.filterConditions[0].value, "A");
});
