import type { PersonalReportFilterCondition } from "../report.types";

export type ReportFilterRow = {
  id: string;
  condition: PersonalReportFilterCondition;
};
export type ReportFilterRows = {
  source: PersonalReportFilterCondition[];
  rows: ReportFilterRow[];
  nextId: number;
};

export function reconcileReportFilterRows(
  previous: ReportFilterRows,
  conditions: PersonalReportFilterCondition[],
): ReportFilterRows {
  const available = new Map(previous.rows.map((row) => [row.condition, row]));
  let nextId = previous.nextId;
  const rows = conditions.map((condition) => {
    const existing = available.get(condition);
    if (existing) {
      available.delete(condition);
      return existing;
    }
    return { id: `condition-${nextId++}`, condition };
  });
  return { source: conditions, rows, nextId };
}
