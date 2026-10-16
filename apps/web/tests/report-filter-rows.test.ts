import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileReportFilterRows,
  type ReportFilterRows,
} from "../src/modules/reports/components/report-filter-rows";
import type { PersonalReportFilterCondition } from "../src/modules/reports/report.types";

const empty: ReportFilterRows = { source: [], rows: [], nextId: 1 };
const condition = (): PersonalReportFilterCondition => ({
  fieldKey: "status",
  operator: "EQUALS",
  value: "ACTIVE",
});

test("removing an earlier condition preserves the remaining row identity", () => {
  const first = condition(),
    second = condition();
  const original = reconcileReportFilterRows(empty, [first, second]);
  assert.notEqual(original.rows[0].id, original.rows[1].id);
  const next = reconcileReportFilterRows(original, [second]);
  assert.equal(next.rows[0], original.rows[1]);
  assert.deepEqual(next.source, [second]);
  assert.equal(next.source[0], second);
});

test("replacement and appended conditions receive fresh identities without changing API values", () => {
  const original = reconcileReportFilterRows(empty, [condition()]);
  const replacement = condition();
  const next = reconcileReportFilterRows(original, [replacement, condition()]);
  assert.equal(
    new Set([...original.rows, ...next.rows].map((row) => row.id)).size,
    3,
  );
  assert.deepEqual(Object.keys(next.source[0]).sort(), [
    "fieldKey",
    "operator",
    "value",
  ]);
  assert.equal(
    reconcileReportFilterRows(next, next.source).rows[0].id,
    next.rows[0].id,
  );
});
