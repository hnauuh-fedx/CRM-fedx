import { Prisma } from "../../generated/prisma/client";

/**
 * Report filter conditions with the same operators as the Lead list filter,
 * chosen by the field's filter type and compiled to SQL against the reporting fact.
 */

export type ReportFilterType = "text" | "number" | "date" | "enum";

/** Operators of saved reports created before typed filters; still executed as before. */
export const legacyReportFilterOperators = [
  "GREATER_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL", "IS_NOT_EMPTY", "IS_EMPTY", "DATE_PRESET", "DATE_BETWEEN",
] as const;

const datePresetOperators = [
  "IS_TODAY", "IS_YESTERDAY", "IS_THIS_WEEK", "IS_LAST_WEEK", "IS_THIS_MONTH", "IS_LAST_MONTH",
  "IS_QUARTER_1", "IS_QUARTER_2", "IS_QUARTER_3", "IS_QUARTER_4",
] as const;

export const typedReportFilterOperators = [
  "CONTAINS", "NOT_CONTAINS", "EQUALS", "NOT_EQUALS", "STARTS_WITH", "ENDS_WITH",
  "GT", "GTE", "LT", "LTE", "BETWEEN", ...datePresetOperators, "IS_X_DAYS_AGO", "HAS_VALUE", "HAS_NO_VALUE",
] as const;

export const reportFilterOperators = [...typedReportFilterOperators, ...legacyReportFilterOperators] as const;
export type ReportFilterOperator = (typeof reportFilterOperators)[number];

export type TypedReportCondition = {
  operator: string;
  value?: string;
  valueTo?: string;
  numberValue?: number;
};

const presenceOperators = new Set(["HAS_VALUE", "HAS_NO_VALUE"]);
const comparisonOperators = ["EQUALS", "NOT_EQUALS", "GT", "GTE", "LT", "LTE", "BETWEEN"];
const operatorsByType: Record<ReportFilterType, Set<string>> = {
  text: new Set(["CONTAINS", "NOT_CONTAINS", "EQUALS", "NOT_EQUALS", "STARTS_WITH", "ENDS_WITH", "HAS_VALUE", "HAS_NO_VALUE"]),
  number: new Set([...comparisonOperators, "HAS_VALUE", "HAS_NO_VALUE"]),
  date: new Set([...comparisonOperators, ...datePresetOperators, "IS_X_DAYS_AGO", "HAS_VALUE", "HAS_NO_VALUE"]),
  enum: new Set(["EQUALS", "NOT_EQUALS", "HAS_VALUE", "HAS_NO_VALUE"]),
};

export function isLegacyReportOperator(operator: string) {
  return (legacyReportFilterOperators as readonly string[]).includes(operator);
}

export function isPresenceOperator(operator: string) {
  return presenceOperators.has(operator);
}

const isoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const isNumber = (value: unknown) => typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));

export function isValidTypedCondition(type: ReportFilterType, condition: TypedReportCondition) {
  const { operator, value, valueTo, numberValue } = condition;
  if (!operatorsByType[type].has(operator)) return false;
  if (presenceOperators.has(operator) || (datePresetOperators as readonly string[]).includes(operator)) return true;
  if (operator === "IS_X_DAYS_AGO") return Number.isInteger(numberValue) && numberValue! >= 0 && numberValue! <= 3650;
  if (type === "date") return operator === "BETWEEN" ? isoDate(value) && isoDate(valueTo) : isoDate(value);
  if (type === "number") return operator === "BETWEEN" ? isNumber(value) && isNumber(valueTo) : isNumber(value);
  return typeof value === "string" && value.trim().length > 0 && value.length <= 255;
}

const utcDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Inclusive calendar-day bounds of a date condition; `today` is the business day in Vietnam. */
export function resolveReportDateBounds(condition: TypedReportCondition, today: string): { from?: string; to?: string } {
  const now = utcDay(today);
  const { operator, value, valueTo } = condition;
  const monday = addDays(now, -((now.getUTCDay() + 6) % 7));
  const month = (offset: number) => ({
    from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))),
    to: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0))),
  });
  switch (operator) {
    case "IS_TODAY": return { from: today, to: today };
    case "IS_YESTERDAY": return { from: iso(addDays(now, -1)), to: iso(addDays(now, -1)) };
    case "IS_X_DAYS_AGO": { const day = iso(addDays(now, -(condition.numberValue ?? 0))); return { from: day, to: day }; }
    case "IS_THIS_WEEK": return { from: iso(monday), to: iso(addDays(monday, 6)) };
    case "IS_LAST_WEEK": return { from: iso(addDays(monday, -7)), to: iso(addDays(monday, -1)) };
    case "IS_THIS_MONTH": return month(0);
    case "IS_LAST_MONTH": return month(-1);
    case "IS_QUARTER_1": case "IS_QUARTER_2": case "IS_QUARTER_3": case "IS_QUARTER_4": {
      const firstMonth = (Number(operator.slice(-1)) - 1) * 3;
      return {
        from: iso(new Date(Date.UTC(now.getUTCFullYear(), firstMonth, 1))),
        to: iso(new Date(Date.UTC(now.getUTCFullYear(), firstMonth + 3, 0))),
      };
    }
    case "EQUALS": case "NOT_EQUALS": return { from: value, to: value };
    case "GT": return { from: iso(addDays(utcDay(value!), 1)) };
    case "GTE": return { from: value };
    case "LT": return { to: iso(addDays(utcDay(value!), -1)) };
    case "LTE": return { to: value };
    case "BETWEEN": return value! <= valueTo! ? { from: value, to: valueTo } : { from: valueTo, to: value };
    default: return {};
  }
}

/** Escapes LIKE wildcards so user text is matched literally. */
function likeValue(text: string) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Text predicate shared by plain columns and tag names. */
export function reportTextSql(text: Prisma.Sql, condition: TypedReportCondition): Prisma.Sql {
  const value = (condition.value ?? "").trim();
  if (condition.operator === "CONTAINS") return Prisma.sql`${text} ILIKE ${`%${likeValue(value)}%`} ESCAPE '\\'`;
  if (condition.operator === "NOT_CONTAINS") return Prisma.sql`(${text} IS NULL OR ${text} NOT ILIKE ${`%${likeValue(value)}%`} ESCAPE '\\')`;
  if (condition.operator === "STARTS_WITH") return Prisma.sql`${text} ILIKE ${`${likeValue(value)}%`} ESCAPE '\\'`;
  if (condition.operator === "ENDS_WITH") return Prisma.sql`${text} ILIKE ${`%${likeValue(value)}`} ESCAPE '\\'`;
  if (condition.operator === "NOT_EQUALS") return Prisma.sql`lower(${text}) IS DISTINCT FROM lower(${value})`;
  return Prisma.sql`lower(${text}) = lower(${value})`;
}

/** SQL for a typed condition on one scalar expression; empty strings count as "no value". */
export function typedConditionSql(expression: Prisma.Sql, type: ReportFilterType, condition: TypedReportCondition, today: string): Prisma.Sql {
  const text = Prisma.sql`NULLIF((${expression})::text, '')`;
  if (condition.operator === "HAS_VALUE") return Prisma.sql`${text} IS NOT NULL`;
  if (condition.operator === "HAS_NO_VALUE") return Prisma.sql`${text} IS NULL`;
  if (type === "text") return reportTextSql(text, condition);
  if (type === "enum") {
    return condition.operator === "NOT_EQUALS"
      ? Prisma.sql`${text} IS DISTINCT FROM ${condition.value}`
      : Prisma.sql`${text} = ${condition.value}`;
  }
  if (type === "number") {
    const number = Prisma.sql`(${expression})::numeric`;
    const value = Number(condition.value);
    switch (condition.operator) {
      case "NOT_EQUALS": return Prisma.sql`${number} IS DISTINCT FROM ${value}::numeric`;
      case "GT": return Prisma.sql`${number} > ${value}::numeric`;
      case "GTE": return Prisma.sql`${number} >= ${value}::numeric`;
      case "LT": return Prisma.sql`${number} < ${value}::numeric`;
      case "LTE": return Prisma.sql`${number} <= ${value}::numeric`;
      case "BETWEEN": {
        const [min, max] = [value, Number(condition.valueTo)].sort((left, right) => left - right);
        return Prisma.sql`${number} BETWEEN ${min}::numeric AND ${max}::numeric`;
      }
      default: return Prisma.sql`${number} = ${value}::numeric`;
    }
  }
  const day = Prisma.sql`(${expression})::date`;
  const bounds = resolveReportDateBounds(condition, today);
  const parts = [
    ...(bounds.from ? [Prisma.sql`${day} >= ${bounds.from}::date`] : []),
    ...(bounds.to ? [Prisma.sql`${day} <= ${bounds.to}::date`] : []),
  ];
  const range = Prisma.sql`(${Prisma.join(parts, " AND ")})`;
  // Records without a date also differ from the selected day.
  return condition.operator === "NOT_EQUALS" ? Prisma.sql`(${day} IS NULL OR NOT ${range})` : range;
}
