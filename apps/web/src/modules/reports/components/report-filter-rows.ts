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

const legacyOperators = new Set(["GREATER_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL", "IS_NOT_EMPTY", "IS_EMPTY", "DATE_PRESET", "DATE_BETWEEN"]);
const valuelessOperators = new Set([
  "HAS_VALUE", "HAS_NO_VALUE", "IS_TODAY", "IS_YESTERDAY", "IS_THIS_WEEK", "IS_LAST_WEEK", "IS_THIS_MONTH", "IS_LAST_MONTH",
  "IS_QUARTER_1", "IS_QUARTER_2", "IS_QUARTER_3", "IS_QUARTER_4", "IS_NOT_EMPTY", "IS_EMPTY",
]);

export function isLegacyReportOperator(operator: string) {
  return legacyOperators.has(operator);
}

/** Whether a filter row has every value its operator needs (the API validates the rest). */
export function isReportConditionComplete(condition: PersonalReportFilterCondition) {
  if (valuelessOperators.has(condition.operator)) return true;
  if (condition.operator === "DATE_BETWEEN") {
    return Boolean(condition.fromDate && condition.toDate && condition.toDate >= condition.fromDate);
  }
  if (condition.operator === "IS_X_DAYS_AGO") return condition.numberValue !== undefined && condition.numberValue >= 0;
  if (condition.operator === "BETWEEN") return Boolean(condition.value?.trim() && condition.valueTo?.trim());
  return Boolean(condition.value?.trim());
}
