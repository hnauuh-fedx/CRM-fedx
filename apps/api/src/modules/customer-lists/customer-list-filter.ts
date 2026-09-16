import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../database/prisma";

export const customerListFilterFields = [
  "fullName", "leadCode", "phone", "email", "pipelineStageId", "sourceId",
  "assigneeId", "gender", "dateOfBirth", "majorId", "createdAt",
] as const;
export const customerListFilterOperators = [
  "contains", "notContains", "equals", "notEquals", "isEmpty", "isNotEmpty",
  "on", "before", "after", "between", "relative",
] as const;
export const customerListRelativeRanges = [
  "today", "yesterday", "thisWeek", "lastWeek", "last7Days", "last30Days",
  "thisMonth", "lastMonth", "thisQuarter", "lastQuarter", "thisYear", "lastYear",
] as const;

export type CustomerListFilterField = typeof customerListFilterFields[number];
export type CustomerListFilterOperator = typeof customerListFilterOperators[number];
export type CustomerListRelativeRange = typeof customerListRelativeRanges[number];
export type CustomerListFilterCondition = {
  field: CustomerListFilterField;
  operator: CustomerListFilterOperator;
  value?: string;
  from?: string;
  to?: string;
  relativeRange?: CustomerListRelativeRange;
};
export type CustomerListFilterConfig = {
  combinator: "AND" | "OR";
  conditions: CustomerListFilterCondition[];
};

const fieldLabels: Record<CustomerListFilterField, string> = {
  fullName: "Họ và tên",
  leadCode: "Mã Lead",
  phone: "Số điện thoại",
  email: "Email",
  pipelineStageId: "Quy trình Telesale",
  sourceId: "Nguồn HV",
  assigneeId: "Nhân viên sale",
  gender: "Giới tính",
  dateOfBirth: "Ngày sinh",
  majorId: "Ngành đăng ký",
  createdAt: "Ngày tạo",
};
const operatorLabels: Record<CustomerListFilterOperator, string> = {
  contains: "có chứa", notContains: "không chứa", equals: "bằng", notEquals: "không bằng",
  isEmpty: "chưa có dữ liệu", isNotEmpty: "có dữ liệu", on: "vào ngày", before: "trước ngày",
  after: "sau ngày", between: "trong khoảng", relative: "trong",
};
const relativeLabels: Record<CustomerListRelativeRange, string> = {
  today: "hôm nay", yesterday: "hôm qua", thisWeek: "tuần này", lastWeek: "tuần trước",
  last7Days: "7 ngày gần nhất", last30Days: "30 ngày gần nhất", thisMonth: "tháng này",
  lastMonth: "tháng trước", thisQuarter: "quý này", lastQuarter: "quý trước",
  thisYear: "năm nay", lastYear: "năm trước",
};

const textFields = new Set<CustomerListFilterField>(["fullName", "leadCode", "phone", "email"]);
const selectFields = new Set<CustomerListFilterField>(["pipelineStageId", "sourceId", "assigneeId", "gender", "majorId"]);
const dateFields = new Set<CustomerListFilterField>(["dateOfBirth", "createdAt"]);
const emptyOperators = new Set<CustomerListFilterOperator>(["isEmpty", "isNotEmpty"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isCustomerListFilterCondition(value: unknown): value is CustomerListFilterCondition {
  if (!isObject(value)) return false;
  if (!customerListFilterFields.includes(value.field as CustomerListFilterField)
    || !customerListFilterOperators.includes(value.operator as CustomerListFilterOperator)) return false;
  const field = value.field as CustomerListFilterField;
  const operator = value.operator as CustomerListFilterOperator;
  if (textFields.has(field) && !["contains", "notContains", "equals", "notEquals", "isEmpty", "isNotEmpty"].includes(operator)) return false;
  if (selectFields.has(field) && !["equals", "notEquals", "isEmpty", "isNotEmpty"].includes(operator)) return false;
  if (field === "dateOfBirth" && !["on", "before", "after", "between", "isEmpty", "isNotEmpty"].includes(operator)) return false;
  if (field === "createdAt" && !["on", "before", "after", "between", "relative"].includes(operator)) return false;
  if (emptyOperators.has(operator)) return true;
  if (operator === "between") return typeof value.from === "string" && typeof value.to === "string" && value.from <= value.to;
  if (operator === "relative") return customerListRelativeRanges.includes(value.relativeRange as CustomerListRelativeRange);
  return typeof value.value === "string" && value.value.length > 0;
}

export function normalizeCustomerListFilterConfig(value: Prisma.JsonValue | CustomerListFilterConfig | null | undefined): CustomerListFilterConfig {
  if (!isObject(value)) return { combinator: "AND", conditions: [] };
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.conditions)) {
    return {
      combinator: record.combinator === "OR" ? "OR" : "AND",
      conditions: record.conditions.filter(isCustomerListFilterCondition).slice(0, 10),
    };
  }

  // Compatibility with lists created before the condition builder was introduced.
  const legacy: CustomerListFilterCondition[] = [];
  if (typeof record.search === "string" && record.search) legacy.push({ field: "fullName", operator: "contains", value: record.search });
  if (typeof record.pipelineStageId === "string" && record.pipelineStageId) legacy.push({ field: "pipelineStageId", operator: "equals", value: record.pipelineStageId });
  if (typeof record.sourceId === "string" && record.sourceId) legacy.push({ field: "sourceId", operator: "equals", value: record.sourceId });
  if (typeof record.assigneeId === "string" && record.assigneeId) legacy.push({ field: "assigneeId", operator: "equals", value: record.assigneeId });
  return { combinator: "AND", conditions: legacy };
}

export function hasCustomerListFilters(config: CustomerListFilterConfig) {
  return config.conditions.length > 0;
}

function textWhere(column: "full_name" | "lead_code" | "phone" | "email", condition: CustomerListFilterCondition): Prisma.leadsWhereInput {
  const value = condition.value ?? "";
  const nullable = column === "lead_code" || column === "email";
  if (condition.operator === "contains") return { [column]: { contains: value, mode: "insensitive" } };
  if (condition.operator === "notContains") return { NOT: { [column]: { contains: value, mode: "insensitive" } } };
  if (condition.operator === "equals") return { [column]: { equals: value, mode: "insensitive" } };
  if (condition.operator === "notEquals") return { NOT: { [column]: { equals: value, mode: "insensitive" } } };
  if (condition.operator === "isEmpty") return nullable ? { OR: [{ [column]: null }, { [column]: "" }] } : { [column]: "" };
  return nullable ? { AND: [{ [column]: { not: null } }, { NOT: { [column]: "" } }] } : { NOT: { [column]: "" } };
}

function bangkokParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const read = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month") - 1, day: read("day") };
}

function bangkokDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - 7 * 60 * 60 * 1000);
}

function createdAtDate(value: string, nextDay = false) {
  const [year, month, day] = value.split("-").map(Number);
  return bangkokDate(year, month - 1, day + (nextDay ? 1 : 0));
}

function birthDate(value: string, nextDay = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + (nextDay ? 1 : 0)));
}

export function resolveRelativeDateRange(range: CustomerListRelativeRange, now = new Date()) {
  const current = bangkokParts(now);
  const today = bangkokDate(current.year, current.month, current.day);
  const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
  const localWeekday = new Date(Date.UTC(current.year, current.month, current.day)).getUTCDay();
  const dayOfWeek = (localWeekday + 6) % 7;
  if (range === "today") return { from: today, to: addDays(today, 1) };
  if (range === "yesterday") return { from: addDays(today, -1), to: today };
  if (range === "last7Days") return { from: addDays(today, -6), to: addDays(today, 1) };
  if (range === "last30Days") return { from: addDays(today, -29), to: addDays(today, 1) };
  if (range === "thisWeek") return { from: addDays(today, -dayOfWeek), to: addDays(today, 7 - dayOfWeek) };
  if (range === "lastWeek") return { from: addDays(today, -dayOfWeek - 7), to: addDays(today, -dayOfWeek) };
  if (range === "thisMonth") return { from: bangkokDate(current.year, current.month, 1), to: bangkokDate(current.year, current.month + 1, 1) };
  if (range === "lastMonth") return { from: bangkokDate(current.year, current.month - 1, 1), to: bangkokDate(current.year, current.month, 1) };
  const quarterMonth = Math.floor(current.month / 3) * 3;
  if (range === "thisQuarter") return { from: bangkokDate(current.year, quarterMonth, 1), to: bangkokDate(current.year, quarterMonth + 3, 1) };
  if (range === "lastQuarter") return { from: bangkokDate(current.year, quarterMonth - 3, 1), to: bangkokDate(current.year, quarterMonth, 1) };
  if (range === "thisYear") return { from: bangkokDate(current.year, 0, 1), to: bangkokDate(current.year + 1, 0, 1) };
  return { from: bangkokDate(current.year - 1, 0, 1), to: bangkokDate(current.year, 0, 1) };
}

function dateWhere(column: "date_of_birth" | "created_at", condition: CustomerListFilterCondition): Prisma.leadsWhereInput {
  if (condition.operator === "isEmpty") return { [column]: null };
  if (condition.operator === "isNotEmpty") return { [column]: { not: null } };
  const parse = column === "created_at" ? createdAtDate : birthDate;
  if (condition.operator === "relative") {
    const range = resolveRelativeDateRange(condition.relativeRange!);
    return { [column]: { gte: range.from, lt: range.to } };
  }
  if (condition.operator === "between") return { [column]: { gte: parse(condition.from!), lt: parse(condition.to!, true) } };
  if (condition.operator === "before") return { [column]: { lt: parse(condition.value!) } };
  if (condition.operator === "after") return { [column]: { gte: parse(condition.value!, true) } };
  return { [column]: { gte: parse(condition.value!), lt: parse(condition.value!, true) } };
}

function conditionWhere(condition: CustomerListFilterCondition): Prisma.leadsWhereInput {
  const textColumns = { fullName: "full_name", leadCode: "lead_code", phone: "phone", email: "email" } as const;
  if (condition.field in textColumns) return textWhere(textColumns[condition.field as keyof typeof textColumns], condition);
  if (condition.field === "dateOfBirth") return dateWhere("date_of_birth", condition);
  if (condition.field === "createdAt") return dateWhere("created_at", condition);
  const column = condition.field === "pipelineStageId" ? "pipeline_stage_id"
    : condition.field === "sourceId" ? "source_id"
      : condition.field === "assigneeId" ? "assigned_to"
        : condition.field === "gender" ? "gender" : condition.field === "majorId" ? "major_id" : null;
  if (!column) return {};
  if (condition.operator === "isEmpty") return { [column]: null };
  if (condition.operator === "isNotEmpty") return { [column]: { not: null } };
  return condition.operator === "notEquals" ? { NOT: { [column]: condition.value } } : { [column]: condition.value };
}

export function customerListDynamicWhere(config: CustomerListFilterConfig): Prisma.leadsWhereInput | null {
  if (!hasCustomerListFilters(config)) return null;
  const conditions = config.conditions.map(conditionWhere);
  return config.combinator === "OR" ? { OR: conditions } : { AND: conditions };
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export async function describeCustomerListFilters(config: CustomerListFilterConfig) {
  if (!hasCustomerListFilters(config)) return "Danh sách tĩnh, chưa thiết lập bộ lọc tự động.";
  const stageIds = config.conditions.filter((item) => item.field === "pipelineStageId" && item.value).map((item) => item.value!);
  const sourceIds = config.conditions.filter((item) => item.field === "sourceId" && item.value).map((item) => item.value!);
  const assigneeIds = config.conditions.filter((item) => item.field === "assigneeId" && item.value).map((item) => item.value!);
  const majorIds = config.conditions.filter((item) => item.field === "majorId" && item.value).map((item) => item.value!);
  const [stages, sources, assignees, majors] = await Promise.all([
    prisma.pipeline_stages.findMany({ where: { id: { in: stageIds } }, select: { id: true, name: true } }),
    prisma.lead_sources.findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true } }),
    prisma.users.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, full_name: true } }),
    prisma.majors.findMany({ where: { id: { in: majorIds } }, select: { id: true, name: true } }),
  ]);
  const labels = new Map<string, string>([
    ...stages.map((item) => [item.id, item.name] as const), ...sources.map((item) => [item.id, item.name] as const),
    ...assignees.map((item) => [item.id, item.full_name] as const), ...majors.map((item) => [item.id, item.name] as const),
  ]);
  const descriptions = config.conditions.map((condition) => {
    const prefix = `${fieldLabels[condition.field]} ${operatorLabels[condition.operator]}`;
    if (emptyOperators.has(condition.operator)) return prefix;
    if (condition.operator === "relative") return `${prefix} ${relativeLabels[condition.relativeRange!]}`;
    if (condition.operator === "between") return `${prefix} ${formatDate(condition.from!)} – ${formatDate(condition.to!)}`;
    const rawValue = condition.value ?? "";
    const value = dateFields.has(condition.field) ? formatDate(rawValue) : labels.get(rawValue) ?? rawValue;
    return `${prefix} “${value}”`;
  });
  return descriptions.join(config.combinator === "OR" ? " HOẶC " : " VÀ ");
}
