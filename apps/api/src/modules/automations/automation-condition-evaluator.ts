import type { AutomationCondition } from "./automation.types";

export function evaluateAutomationConditions(
  values: Map<string, unknown>,
  combinator: "AND" | "OR",
  conditions: AutomationCondition[],
) {
  const results = conditions.map((condition) => evaluatePredicate(values.get(condition.field), condition));
  return combinator === "AND" ? results.every(Boolean) : results.some(Boolean);
}

function evaluatePredicate(actualValue: unknown, condition: AutomationCondition) {
  const compareValue = String(condition.value ?? "").trim();
  switch (condition.operator) {
    case "equals": return equals(actualValue, compareValue);
    case "not_equals": return !equals(actualValue, compareValue);
    case "contains": return contains(actualValue, compareValue);
    case "not_contains": return !contains(actualValue, compareValue);
    case "exists": return !isEmpty(actualValue);
    case "empty": return isEmpty(actualValue);
    case "greater_than": return compareNumbers(actualValue, compareValue, (actual, expected) => actual > expected);
    case "less_than": return compareNumbers(actualValue, compareValue, (actual, expected) => actual < expected);
    case "before": return compareDates(actualValue, compareValue, (actual, expected) => actual < expected);
    case "after": return compareDates(actualValue, compareValue, (actual, expected) => actual > expected);
    case "in": return isIn(actualValue, compareValue);
    case "not_in": return !isIn(actualValue, compareValue);
    default: throw new Error(`Toán tử điều kiện không được hỗ trợ: ${condition.operator}`);
  }
}

function equals(actualValue: unknown, expected: string) {
  if (Array.isArray(actualValue)) return actualValue.some((item) => normalizeScalar(item) === expected);
  return normalizeScalar(actualValue) === expected;
}

function contains(actualValue: unknown, expected: string) {
  if (Array.isArray(actualValue)) return actualValue.some((item) => normalizeScalar(item).includes(expected));
  return normalizeScalar(actualValue).includes(expected);
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function isIn(actualValue: unknown, expected: string) {
  const candidates = expected.split(",").map((value) => value.trim()).filter(Boolean);
  if (Array.isArray(actualValue)) return actualValue.some((item) => candidates.includes(normalizeScalar(item)));
  return candidates.includes(normalizeScalar(actualValue));
}

function compareNumbers(actualValue: unknown, expected: string, compare: (actual: number, expected: number) => boolean) {
  const actualNumber = Number(actualValue);
  const expectedNumber = Number(expected);
  return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && compare(actualNumber, expectedNumber);
}

function compareDates(actualValue: unknown, expected: string, compare: (actual: number, expected: number) => boolean) {
  const actualDate = actualValue instanceof Date ? actualValue.getTime() : Date.parse(String(actualValue));
  const expectedDate = Date.parse(expected);
  return Number.isFinite(actualDate) && Number.isFinite(expectedDate) && compare(actualDate, expectedDate);
}

function normalizeScalar(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "");
}
