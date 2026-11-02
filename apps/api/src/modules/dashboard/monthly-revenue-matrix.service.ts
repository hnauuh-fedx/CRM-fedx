import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import { resolvePersonalReportDateRange } from "../reports/personal-report.service";

export type MonthlyRevenueMatrixGranularity = "MONTH" | "QUARTER" | "DAY";

export type MonthlyRevenueMatrixFilters = {
  year?: number;
  granularity?: "MONTH" | "QUARTER";
  majorId?: string;
  sourceId?: string;
  filterOperator?: "EQUALS" | "NOT_EQUALS";
  timePreset?: "LAST_7_DAYS" | "THIS_WEEK" | "LAST_WEEK" | "THIS_MONTH" | "LAST_MONTH" | "THIS_QUARTER" | "LAST_QUARTER" | "CUSTOM";
  fromDate?: string;
  toDate?: string;
};

export type MonthlyRevenueMatrixColumn = { key: string; label: string; fromDate: string; toDate: string };

/** Day columns stay readable with horizontal scrolling up to roughly one year. */
export const MONTHLY_REVENUE_MAX_DAY_COLUMNS = 366;

export class MonthlyRevenueMatrixRangeError extends Error {}

/**
 * Builds the time columns of the "Doanh số tháng" matrix. Column keys are the ISO date
 * of each bucket start so they match `date_trunc` output from the aggregate query.
 */
export function buildMonthlyRevenueColumns(
  filters: Pick<MonthlyRevenueMatrixFilters, "year" | "granularity" | "timePreset" | "fromDate" | "toDate">,
  today: string,
): { granularity: MonthlyRevenueMatrixGranularity; year: number | null; columns: MonthlyRevenueMatrixColumn[] } {
  const [todayYear, todayMonth] = today.split("-").map(Number) as [number, number];

  if (filters.timePreset) {
    const range = filters.timePreset === "CUSTOM"
      ? (filters.fromDate && filters.toDate ? { fromDate: filters.fromDate, toDate: filters.toDate } : null)
      : resolvePersonalReportDateRange({ timePreset: filters.timePreset }, today);
    if (!range) throw new MonthlyRevenueMatrixRangeError("Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.");
    const from = parseIsoDate(range.fromDate);
    const to = parseIsoDate(range.toDate);
    const dayCount = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (dayCount < 1) throw new MonthlyRevenueMatrixRangeError("Khoảng ngày không hợp lệ.");
    if (dayCount > MONTHLY_REVENUE_MAX_DAY_COLUMNS) {
      throw new MonthlyRevenueMatrixRangeError(`Khoảng ngày tối đa ${MONTHLY_REVENUE_MAX_DAY_COLUMNS} ngày.`);
    }
    const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
    const columns = Array.from({ length: dayCount }, (_, index) => {
      const day = new Date(from);
      day.setUTCDate(day.getUTCDate() + index);
      const iso = toIsoDate(day);
      const [year, month, date] = iso.split("-");
      return { key: iso, label: sameYear ? `${date}/${month}` : `${date}/${month}/${year}`, fromDate: iso, toDate: iso };
    });
    return { granularity: "DAY", year: null, columns };
  }

  const year = filters.year ?? todayYear;
  if (filters.granularity === "QUARTER") {
    // Only finished quarters are shown for the current year.
    const lastQuarter = year < todayYear ? 4 : year === todayYear ? Math.floor((todayMonth - 1) / 3) : 4;
    const columns = Array.from({ length: lastQuarter }, (_, index) => {
      const quarter = index + 1;
      const fromDate = toIsoDate(new Date(Date.UTC(year, (quarter - 1) * 3, 1)));
      return { key: fromDate, label: `Quý ${quarter}/${year}`, fromDate, toDate: toIsoDate(new Date(Date.UTC(year, quarter * 3, 0))) };
    });
    return { granularity: "QUARTER", year, columns };
  }

  const lastMonth = year === todayYear ? todayMonth : 12;
  const columns = Array.from({ length: lastMonth }, (_, index) => {
    const fromDate = toIsoDate(new Date(Date.UTC(year, index, 1)));
    return {
      key: fromDate,
      label: `${String(index + 1).padStart(2, "0")}/${year}`,
      fromDate,
      toDate: toIsoDate(new Date(Date.UTC(year, index + 1, 0))),
    };
  });
  return { granularity: "MONTH", year, columns };
}

export function buildMonthlyRevenueMatrix(
  columns: MonthlyRevenueMatrixColumn[],
  assignees: Array<{ id: string; name: string }>,
  groups: Array<{ assignee_id: string; bucket: string; total: number }>,
) {
  const columnKeys = new Set(columns.map((column) => column.key));
  const columnTotals = new Map(columns.map((column) => [column.key, 0]));
  const rowsById = new Map(assignees.map((assignee) => [assignee.id, {
    id: assignee.id,
    name: assignee.name,
    values: {} as Record<string, number>,
    total: 0,
  }]));

  for (const group of groups) {
    const row = rowsById.get(group.assignee_id);
    if (!row || !columnKeys.has(group.bucket)) continue;
    row.values[group.bucket] = (row.values[group.bucket] ?? 0) + group.total;
    row.total += group.total;
    columnTotals.set(group.bucket, (columnTotals.get(group.bucket) ?? 0) + group.total);
  }

  const total = Array.from(columnTotals.values()).reduce((sum, value) => sum + value, 0);
  // A period without any "Doanh số tháng" data renders as an empty table.
  if (total === 0) return { columns: [], rows: [], total: 0 };

  return {
    columns: columns.map((column) => ({ key: column.key, label: column.label, total: columnTotals.get(column.key) ?? 0 })),
    rows: Array.from(rowsById.values()).sort((left, right) => left.name.localeCompare(right.name, "vi")),
    total,
  };
}

export async function getDirectorMonthlyRevenueMatrix(
  institutionProgramId?: string,
  filters: MonthlyRevenueMatrixFilters = {},
  today = todayInVietnam(),
) {
  const { granularity, year, columns } = buildMonthlyRevenueColumns(filters, today);
  const programCondition = institutionProgramId
    ? Prisma.sql`AND l.institution_program_id = ${institutionProgramId}::uuid`
    : Prisma.empty;
  const availableYears = await listMonthlyRevenueYears(programCondition, Number(today.slice(0, 4)));

  // Staff who own data in this program keep a row even when they have no revenue in the period.
  const assignees = await prisma.users.findMany({
    where: {
      deleted_at: null,
      leads_leads_assigned_toTousers: {
        some: { deleted_at: null, ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) },
      },
    },
    select: { id: true, full_name: true },
  });

  if (columns.length === 0) {
    return { granularity, year, availableYears, columns: [], rows: [], total: 0 };
  }

  const unit = granularity === "DAY" ? Prisma.raw("'day'") : granularity === "QUARTER" ? Prisma.raw("'quarter'") : Prisma.raw("'month'");
  const groups = await prisma.$queryRaw<Array<{ assignee_id: string; bucket: string; total: number }>>`
    SELECT l.assigned_to::text AS assignee_id,
           to_char(date_trunc(${unit}, ap.monthly_revenue), 'YYYY-MM-DD') AS bucket,
           COUNT(*)::int AS total
    FROM admission_profiles ap
    JOIN leads l ON l.id = ap.lead_id
    WHERE l.deleted_at IS NULL
      AND l.assigned_to IS NOT NULL
      AND ap.monthly_revenue BETWEEN ${columns[0]!.fromDate}::date AND ${columns.at(-1)!.toDate}::date
      ${programCondition}
      ${buildCategoryCondition(filters)}
    GROUP BY 1, 2
  `;

  return {
    granularity,
    year,
    availableYears,
    ...buildMonthlyRevenueMatrix(columns, assignees.map((user) => ({ id: user.id, name: user.full_name })), groups),
  };
}

async function listMonthlyRevenueYears(programCondition: Prisma.Sql, currentYear: number) {
  const rows = await prisma.$queryRaw<Array<{ year: number }>>`
    SELECT DISTINCT EXTRACT(YEAR FROM ap.monthly_revenue)::int AS year
    FROM admission_profiles ap
    JOIN leads l ON l.id = ap.lead_id
    WHERE l.deleted_at IS NULL
      AND ap.monthly_revenue IS NOT NULL
      ${programCondition}
  `;
  return Array.from(new Set([currentYear, ...rows.map((row) => row.year)])).sort((left, right) => right - left);
}

function buildCategoryCondition(filters: MonthlyRevenueMatrixFilters) {
  const isNotEqual = filters.filterOperator === "NOT_EQUALS";
  if (filters.majorId) {
    return isNotEqual
      ? Prisma.sql`AND (l.major_id IS NULL OR l.major_id <> ${filters.majorId}::uuid)`
      : Prisma.sql`AND l.major_id = ${filters.majorId}::uuid`;
  }
  if (filters.sourceId) {
    return isNotEqual
      ? Prisma.sql`AND (l.source_id IS NULL OR l.source_id <> ${filters.sourceId}::uuid)`
      : Prisma.sql`AND l.source_id = ${filters.sourceId}::uuid`;
  }
  return Prisma.empty;
}

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
