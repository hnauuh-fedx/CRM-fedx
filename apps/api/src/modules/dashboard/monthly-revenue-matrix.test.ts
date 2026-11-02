import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthlyRevenueColumns,
  buildMonthlyRevenueMatrix,
  MonthlyRevenueMatrixRangeError,
} from "./monthly-revenue-matrix.service";

const today = "2026-10-30";

test("default view lists months of the current year up to the current month", () => {
  const result = buildMonthlyRevenueColumns({}, today);
  assert.equal(result.granularity, "MONTH");
  assert.equal(result.year, 2026);
  assert.equal(result.columns.length, 10);
  assert.deepEqual(result.columns[0], { key: "2026-01-01", label: "01/2026", fromDate: "2026-01-01", toDate: "2026-01-31" });
  assert.equal(result.columns.at(-1)?.label, "10/2026");
  assert.equal(result.columns.at(-1)?.toDate, "2026-10-31");
});

test("a past year lists all twelve months", () => {
  const result = buildMonthlyRevenueColumns({ year: 2025 }, today);
  assert.equal(result.columns.length, 12);
  assert.equal(result.columns[1]?.toDate, "2025-02-28");
});

test("quarter view only lists finished quarters of the current year", () => {
  assert.deepEqual(
    buildMonthlyRevenueColumns({ granularity: "QUARTER" }, today).columns.map((column) => column.label),
    ["Quý 1/2026", "Quý 2/2026", "Quý 3/2026"],
  );
  assert.equal(buildMonthlyRevenueColumns({ granularity: "QUARTER" }, "2026-02-10").columns.length, 0);
  const pastYear = buildMonthlyRevenueColumns({ granularity: "QUARTER", year: 2025 }, today).columns;
  assert.equal(pastYear.length, 4);
  assert.deepEqual(pastYear[3], { key: "2025-10-01", label: "Quý 4/2025", fromDate: "2025-10-01", toDate: "2025-12-31" });
});

test("date filters switch the columns to single days", () => {
  const week = buildMonthlyRevenueColumns({ timePreset: "LAST_7_DAYS" }, today);
  assert.equal(week.granularity, "DAY");
  assert.equal(week.year, null);
  assert.deepEqual(week.columns.map((column) => column.key), [
    "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30",
  ]);
  assert.equal(week.columns[0]?.label, "24/10");

  const custom = buildMonthlyRevenueColumns({ timePreset: "CUSTOM", fromDate: "2025-12-30", toDate: "2026-01-02" }, today);
  assert.deepEqual(custom.columns.map((column) => column.label), ["30/12/2025", "31/12/2025", "01/01/2026", "02/01/2026"]);
});

test("custom ranges must be complete and bounded", () => {
  assert.throws(() => buildMonthlyRevenueColumns({ timePreset: "CUSTOM", fromDate: "2026-01-01" }, today), MonthlyRevenueMatrixRangeError);
  assert.throws(
    () => buildMonthlyRevenueColumns({ timePreset: "CUSTOM", fromDate: "2024-01-01", toDate: "2026-01-01" }, today),
    MonthlyRevenueMatrixRangeError,
  );
});

test("matrix keeps staff without revenue and totals rows and columns", () => {
  const { columns } = buildMonthlyRevenueColumns({ year: 2026 }, "2026-02-15");
  const matrix = buildMonthlyRevenueMatrix(
    columns,
    [{ id: "b", name: "Bảo Yến" }, { id: "a", name: "An" }, { id: "c", name: "Chi" }],
    [
      { assignee_id: "a", bucket: "2026-01-01", total: 10 },
      { assignee_id: "a", bucket: "2026-02-01", total: 5 },
      { assignee_id: "b", bucket: "2026-01-01", total: 12 },
      { assignee_id: "b", bucket: "2026-02-01", total: 4 },
      { assignee_id: "unknown", bucket: "2026-01-01", total: 99 },
    ],
  );
  assert.deepEqual(matrix.rows.map((row) => [row.name, row.total]), [["An", 15], ["Bảo Yến", 16], ["Chi", 0]]);
  assert.deepEqual(matrix.columns.map((column) => column.total), [22, 9]);
  assert.equal(matrix.total, 31);
});

test("a period without revenue data renders nothing", () => {
  const { columns } = buildMonthlyRevenueColumns({ year: 2024 }, today);
  assert.deepEqual(buildMonthlyRevenueMatrix(columns, [{ id: "a", name: "An" }], []), { columns: [], rows: [], total: 0 });
});
