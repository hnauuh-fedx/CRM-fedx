import assert from "node:assert/strict";
import { test } from "node:test";
import { assignmentPresetRange, defaultAssignmentFilters, readAssignmentFilters, writeAssignmentFilters } from "../src/modules/reports/assignment-report-model";
test("presets use Vietnamese calendar dates even before the UTC day changes", () => {
  const now = new Date("2026-10-31T18:00:00Z");
  assert.deepEqual(assignmentPresetRange("THIS_MONTH", now), { fromDate: "2026-11-01", toDate: "2026-11-01" });
  assert.deepEqual(assignmentPresetRange("THIS_WEEK", now), { fromDate: "2026-10-26", toDate: "2026-11-01" });
});
test("filters round trip through URL without overwriting other dashboard filters", () => {
  const filters = defaultAssignmentFilters(new Date("2026-11-05T10:00:00Z"));
  filters.assigneeIds = ["00000000-0000-4000-8000-000000000001"];
  filters.eventTypes = ["WARNING_1", "WITHDRAWN"];
  const result = writeAssignmentFilters(new URLSearchParams("other=value"), filters);
  assert.equal(result.get("other"), "value");
  assert.deepEqual(readAssignmentFilters(result), filters);
});
test("URL state rejects invalid IDs, clears automation for manual assignments and deduplicates types", () => {
  const filters = readAssignmentFilters(new URLSearchParams("assignment.method=MANUAL&assignment.ruleIds=00000000-0000-4000-8000-000000000001&assignment.assigneeIds=invalid&assignment.eventTypes=ASSIGNED,ASSIGNED,invalid"));
  assert.deepEqual(filters.ruleIds, []);
  assert.deepEqual(filters.assigneeIds, []);
  assert.deepEqual(filters.eventTypes, ["ASSIGNED"]);
});
