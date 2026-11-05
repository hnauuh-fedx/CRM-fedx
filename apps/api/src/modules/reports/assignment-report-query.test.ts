import assert from "node:assert/strict";
import { test } from "node:test";
import { assignmentDateBounds, assignmentReportQuerySchema, assignmentReportScope } from "./assignment-report-query";
import type { AuthUser } from "../auth/auth.types";
const program = "00000000-0000-4000-8000-000000000001";
const user: AuthUser = { id: "00000000-0000-4000-8000-000000000002", email: "test@example.test", fullName: "Test", avatarUrl: null, roles: ["DIRECTOR"], permissions: [], institutionProgramIds: [program], departmentIds: [], accessScope: "ALL" };
test("Vietnamese day boundaries include the end day and cross UTC months", () => {
  const bounds = assignmentDateBounds("2026-11-01", "2026-11-01");
  assert.equal(bounds.from.toISOString(), "2026-10-31T17:00:00.000Z");
  assert.equal(bounds.until.toISOString(), "2026-11-01T17:00:00.000Z");
});
test("reject invalid dates, excessive pages, untrusted sort identifiers and contradictory filters", () => {
  const valid = { fromDate: "2026-11-01", toDate: "2026-11-30" };
  for (const extra of [{ toDate: "2026-10-30" }, { fromDate: "2026-02-30" }, { limit: 1000 }, { page: 0 }, { sortBy: "name;DROP TABLE users" }, { sourceIds: "invalid" }, { eventTypes: "" }, { method: "MANUAL", ruleIds: program }]) {
    assert.equal(assignmentReportQuerySchema.safeParse({ ...valid, ...extra }).success, false);
  }
  assert.equal(assignmentReportQuerySchema.parse(valid).eventTypes.length, 4);
});
test("role names, missing departments, unauthorized programs and absent permissions fail closed", () => {
  assert.equal(assignmentReportScope(user, program).sql, "FALSE");
  const granted = { ...user, permissions: ["report.view_all"] };
  assert.equal(assignmentReportScope(granted, "00000000-0000-4000-8000-000000000099").sql, "FALSE");
  assert.equal(assignmentReportScope({ ...granted, accessScope: "DEPARTMENT" }, program).sql, "FALSE");
  const restricted = assignmentReportScope({ ...granted, accessScope: "ASSIGNED_ONLY" }, program);
  assert.ok(restricted.sql.includes("e.assignee_id"));
  assert.ok(restricted.values.includes(user.id));
});
