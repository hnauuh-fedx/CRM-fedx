import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../database/prisma";
import { hasCustomFieldPermission } from "../custom-fields/custom-field-permissions";
import type { AuthUser } from "../auth/auth.types";
import { ACTIVE_LEAD_STATUS, FAILED_LEAD_STATUS_PREFIX } from "./domain/lead-lifecycle-status";
import { getLeadFieldFilterDefinition, leadFieldFilterDefinitions, leadFieldWhere } from "./lead-field-filter";

/**
 * Bộ lọc nâng cao cho danh sách lead: trường hệ thống + trường tùy chỉnh,
 * nối VÀ/HOẶC theo thứ tự dòng (left-associative): ((A op1 B) op2 C) ...
 */

export const MAX_FILTER_CONDITIONS = 5;
// custom_field_values là bảng đa hình (không có quan hệ Prisma tới leads) nên phải
// lấy trước danh sách lead khớp; giới hạn để query `id IN (...)` luôn an toàn.
export const CUSTOM_FIELD_MATCH_LIMIT = 20_000;

export const filterOperators = [
  "CONTAINS", "NOT_CONTAINS", "EQUALS", "NOT_EQUALS", "STARTS_WITH", "ENDS_WITH",
  "GT", "GTE", "LT", "LTE", "BETWEEN",
  "IS_TODAY", "IS_YESTERDAY", "IS_THIS_WEEK", "IS_LAST_WEEK", "IS_THIS_MONTH", "IS_LAST_MONTH",
  "IS_QUARTER_1", "IS_QUARTER_2", "IS_QUARTER_3", "IS_QUARTER_4", "IS_X_DAYS_AGO",
  "HAS_VALUE", "HAS_NO_VALUE", "COUNT_EQUALS",
] as const;
export type FilterOperator = (typeof filterOperators)[number];

const systemFieldKeys = [
  "fullName", "phone", "email", "leadCode", "gclid", "temperature",
  "dateOfBirth", "createdAt",
  "pipelineStageId", "status", "sourceId", "majorId", "assigneeId",
] as const;
type SystemFieldKey = (typeof systemFieldKeys)[number];
const sensitiveSystemFields = new Set<SystemFieldKey>(["phone", "email"]);
/** Cột NOT NULL trong bảng leads. */
const requiredTextFields = new Set<SystemFieldKey>(["fullName", "phone"]);

/** Other Lead form fields, filtered through the shared catalog (related tables included). */
const catalogFieldKeys = leadFieldFilterDefinitions
  .map((field) => field.key)
  .filter((key) => !(systemFieldKeys as readonly string[]).includes(key));
const isCatalogField = (field: string) => catalogFieldKeys.includes(field);

const filterConditionSchema = z.object({
  combinator: z.enum(["AND", "OR"]).optional(),
  field: z.union([
    z.enum(systemFieldKeys),
    z.string().refine(isCatalogField),
    z.string().regex(/^cf:[0-9a-fA-F-]{36}$/),
  ]),
  operator: z.enum(filterOperators),
  value: z.union([z.string().trim().max(500), z.number().finite(), z.boolean()]).nullish(),
  valueTo: z.union([z.string().trim().max(500), z.number().finite()]).nullish(),
  numberValue: z.number().int().min(0).max(3650).nullish(),
});
export type FilterCondition = z.infer<typeof filterConditionSchema>;

/** Query param `filters` là chuỗi JSON (Express 5 không parse được mảng lồng nhau trong query). */
export const filterConditionsParamSchema = z
  .preprocess((raw) => {
    if (raw === undefined || raw === "") return [];
    if (typeof raw !== "string") return raw;
    try { return JSON.parse(raw); } catch { return raw; }
  }, z.array(filterConditionSchema).max(MAX_FILTER_CONDITIONS))
  .default([]);

export class LeadFilterError extends Error {
  constructor(public readonly status: 400 | 403, message: string) {
    super(message);
  }
}

type DateRange = { gte?: Date; lte?: Date; gt?: Date; lt?: Date };
type CustomField = { id: string; key: string; type: string };

type ConditionValue = FilterCondition["value"];

function invalid(): never {
  throw new LeadFilterError(400, "Điều kiện lọc không hợp lệ. Vui lòng kiểm tra lại giá trị đã nhập.");
}

function textValue(value: ConditionValue): string {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) invalid();
  return text;
}

function numberOf(value: ConditionValue | FilterCondition["valueTo"]): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(parsed)) invalid();
  return parsed;
}

function booleanOf(value: ConditionValue): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return invalid();
}

/** Ngày dạng YYYY-MM-DD được hiểu theo giờ địa phương của server, giống các preset. */
function parseDay(value: ConditionValue | FilterCondition["valueTo"]): Date {
  const text = textValue(value as ConditionValue);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) invalid();
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(day.getTime())) invalid();
  return day;
}

const startOfDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
const endOfDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
const addDays = (day: Date, days: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
const startOfWeek = (day: Date) => addDays(day, -((day.getDay() + 6) % 7)); // Thứ Hai

/** Khoảng ngày khớp với điều kiện (NOT_EQUALS trả về khoảng của chính ngày đó; caller phủ định). */
export function resolveDateRange(condition: FilterCondition, now = new Date()): DateRange {
  const { operator } = condition;
  const today = startOfDay(now);
  switch (operator) {
    case "IS_TODAY": return { gte: today, lte: endOfDay(today) };
    case "IS_YESTERDAY": return { gte: addDays(today, -1), lte: endOfDay(addDays(today, -1)) };
    case "IS_X_DAYS_AGO": {
      if (condition.numberValue === null || condition.numberValue === undefined) invalid();
      const day = addDays(today, -condition.numberValue);
      return { gte: day, lte: endOfDay(day) };
    }
    case "IS_THIS_WEEK": return { gte: startOfWeek(today), lte: endOfDay(addDays(startOfWeek(today), 6)) };
    case "IS_LAST_WEEK": {
      const start = addDays(startOfWeek(today), -7);
      return { gte: start, lte: endOfDay(addDays(start, 6)) };
    }
    case "IS_THIS_MONTH":
      return { gte: new Date(today.getFullYear(), today.getMonth(), 1), lte: endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    case "IS_LAST_MONTH":
      return { gte: new Date(today.getFullYear(), today.getMonth() - 1, 1), lte: endOfDay(new Date(today.getFullYear(), today.getMonth(), 0)) };
    case "IS_QUARTER_1": case "IS_QUARTER_2": case "IS_QUARTER_3": case "IS_QUARTER_4": {
      const firstMonth = (Number(operator.slice(-1)) - 1) * 3;
      return { gte: new Date(today.getFullYear(), firstMonth, 1), lte: endOfDay(new Date(today.getFullYear(), firstMonth + 3, 0)) };
    }
    case "EQUALS": case "NOT_EQUALS": {
      const day = parseDay(condition.value);
      return { gte: day, lte: endOfDay(day) };
    }
    case "GT": return { gt: endOfDay(parseDay(condition.value)) };
    case "GTE": return { gte: parseDay(condition.value) };
    case "LT": return { lt: parseDay(condition.value) };
    case "LTE": return { lte: endOfDay(parseDay(condition.value)) };
    case "BETWEEN": {
      const [from, to] = [parseDay(condition.value), parseDay(condition.valueTo)].sort((a, b) => a.getTime() - b.getTime());
      return { gte: from, lte: endOfDay(to) };
    }
    default: return invalid();
  }
}

const textOperators = new Set<FilterOperator>(["CONTAINS", "NOT_CONTAINS", "EQUALS", "NOT_EQUALS", "STARTS_WITH", "ENDS_WITH"]);

/** Điều kiện text dương (CONTAINS/EQUALS/...) cho 1 cột string; NOT_* trả về dạng dương, caller phủ định. */
function positiveTextFilter(operator: FilterOperator, value: ConditionValue) {
  const text = textValue(value);
  if (operator === "CONTAINS" || operator === "NOT_CONTAINS") return { contains: text, mode: "insensitive" as const };
  if (operator === "EQUALS" || operator === "NOT_EQUALS") return { equals: text, mode: "insensitive" as const };
  if (operator === "STARTS_WITH") return { startsWith: text, mode: "insensitive" as const };
  if (operator === "ENDS_WITH") return { endsWith: text, mode: "insensitive" as const };
  return invalid();
}

const isNegative = (operator: FilterOperator) => operator === "NOT_CONTAINS" || operator === "NOT_EQUALS";

function systemFieldWhere(field: SystemFieldKey, condition: FilterCondition): Prisma.leadsWhereInput {
  const { operator, value } = condition;
  const column = {
    fullName: "full_name", phone: "phone", email: "email", leadCode: "lead_code", temperature: "temperature",
    dateOfBirth: "date_of_birth", createdAt: "created_at",
    pipelineStageId: "pipeline_stage_id", sourceId: "source_id", assigneeId: "assigned_to",
  } as const;

  if (field === "gclid") {
    if (operator === "HAS_VALUE") return { utm_trackings: { some: { gclid: { not: null } } } };
    if (operator === "HAS_NO_VALUE") return { utm_trackings: { none: { gclid: { not: null } } } };
    if (!textOperators.has(operator)) invalid();
    const match = { gclid: positiveTextFilter(operator, value) };
    return isNegative(operator) ? { utm_trackings: { none: match } } : { utm_trackings: { some: match } };
  }

  if (field === "majorId") {
    if (operator === "HAS_VALUE") return { OR: [{ major_id: { not: null } }, { admission_profiles: { is: { major_id: { not: null } } } }] };
    if (operator === "HAS_NO_VALUE") return { major_id: null, NOT: { admission_profiles: { is: { major_id: { not: null } } } } };
    const majorId = textValue(value);
    const matches: Prisma.leadsWhereInput = { OR: [{ major_id: majorId }, { admission_profiles: { is: { major_id: majorId } } }] };
    if (operator === "EQUALS") return matches;
    if (operator === "NOT_EQUALS") return { NOT: matches };
    return invalid();
  }

  if (field === "status") {
    // Trạng thái vòng đời luôn có giá trị; FAIL được lưu dạng "FAIL:<stageId>".
    const statusWhere = (status: string): Prisma.leadsWhereInput => status === "FAIL"
      ? { status: { startsWith: FAILED_LEAD_STATUS_PREFIX } }
      : status === "ACTIVE" ? { status: ACTIVE_LEAD_STATUS } : invalid();
    if (operator === "EQUALS") return statusWhere(textValue(value));
    if (operator === "NOT_EQUALS") return { NOT: statusWhere(textValue(value)) };
    if (operator === "HAS_VALUE") return {};
    if (operator === "HAS_NO_VALUE") return { id: { in: [] } };
    return invalid();
  }

  const name = column[field];

  if (field === "createdAt" || field === "dateOfBirth" || field === "pipelineStageId" || field === "sourceId" || field === "assigneeId") {
    if (operator === "HAS_VALUE") return { [name]: { not: null } };
    if (operator === "HAS_NO_VALUE") return { [name]: null };
    if (field === "createdAt" || field === "dateOfBirth") {
      const range = resolveDateRange(condition);
      if (operator === "NOT_EQUALS") return { OR: [{ [name]: { lt: range.gte } }, { [name]: { gt: range.lte } }] };
      return { [name]: range };
    }
    const id = textValue(value);
    if (operator === "EQUALS") return { [name]: id };
    // Lead chưa có giá trị cũng được tính là "khác".
    if (operator === "NOT_EQUALS") return { OR: [{ [name]: null }, { NOT: { [name]: id } }] };
    return invalid();
  }

  // Cột text: chuỗi rỗng cũng là "không có giá trị". full_name/phone là cột bắt buộc nên
  // Prisma không cho so sánh với null — chỉ cột tùy chọn mới thêm điều kiện null.
  const nullable = !requiredTextFields.has(field);
  if (operator === "HAS_VALUE") {
    return nullable ? { AND: [{ [name]: { not: null } }, { NOT: { [name]: "" } }] } : { NOT: { [name]: "" } };
  }
  if (operator === "HAS_NO_VALUE") return nullable ? { OR: [{ [name]: null }, { [name]: "" }] } : { [name]: "" };
  if (!textOperators.has(operator)) invalid();
  const match = { [name]: positiveTextFilter(operator, value) };
  if (!isNegative(operator)) return match;
  return nullable ? { OR: [{ [name]: null }, { NOT: match }] } : { NOT: match };
}

/** Lead form field ngoài nhóm trường cũ: chuyển toán tử sang predicate dùng chung. */
async function catalogFieldWhere(condition: FilterCondition): Promise<Prisma.leadsWhereInput> {
  const definition = getLeadFieldFilterDefinition(condition.field)!;
  const { operator, value } = condition;
  if (definition.kind === "list") return tagFieldWhere(condition);
  if (operator === "HAS_VALUE" || operator === "HAS_NO_VALUE") {
    return leadFieldWhere(definition.key, { type: "hasValue" }, operator === "HAS_NO_VALUE");
  }
  const negate = isNegative(operator);
  if (definition.kind === "text") {
    if (!textOperators.has(operator)) invalid();
    const mode = operator === "STARTS_WITH" ? "startsWith" : operator === "ENDS_WITH" ? "endsWith"
      : operator === "EQUALS" || operator === "NOT_EQUALS" ? "equals" : "contains";
    return leadFieldWhere(definition.key, { type: "text", mode, value: textValue(value) }, negate);
  }
  if (definition.kind === "select") {
    if (operator !== "EQUALS" && operator !== "NOT_EQUALS") invalid();
    const selected = textValue(value);
    // Reference fields (major, admission status, ...) store ids; gender stores a fixed code.
    if (definition.key !== "gender" && !z.uuid().safeParse(selected).success) invalid();
    return leadFieldWhere(definition.key, { type: "equals", value: selected }, negate);
  }
  if (definition.kind === "date") return leadFieldWhere(definition.key, { type: "range", ...resolveDateRange(condition) }, negate);
  if (operator === "EQUALS" || operator === "NOT_EQUALS") return leadFieldWhere(definition.key, { type: "equals", value: numberOf(value) }, negate);
  if (operator === "GT") return leadFieldWhere(definition.key, { type: "range", gt: numberOf(value) });
  if (operator === "GTE") return leadFieldWhere(definition.key, { type: "range", gte: numberOf(value) });
  if (operator === "LT") return leadFieldWhere(definition.key, { type: "range", lt: numberOf(value) });
  if (operator === "LTE") return leadFieldWhere(definition.key, { type: "range", lte: numberOf(value) });
  if (operator === "BETWEEN") {
    const [min, max] = [numberOf(value), numberOf(condition.valueTo)].sort((a, b) => a - b);
    return leadFieldWhere(definition.key, { type: "range", gte: min, lte: max });
  }
  return invalid();
}

/** Tags dùng bảng đa hình entity_tags nên lấy trước danh sách lead khớp, giống trường tùy chỉnh. */
async function tagFieldWhere(condition: FilterCondition): Promise<Prisma.leadsWhereInput> {
  const { operator, value } = condition;
  const presence = operator === "HAS_VALUE" || operator === "HAS_NO_VALUE";
  if (!presence && !textOperators.has(operator)) invalid();
  const tagWhere = presence ? {} : { tags: { is: { name: positiveTextFilter(operator, value) } } };
  const rows = await prisma.entity_tags.findMany({
    where: { entity_type: "lead", ...tagWhere },
    select: { entity_id: true },
    distinct: ["entity_id"],
    take: CUSTOM_FIELD_MATCH_LIMIT + 1,
  });
  if (rows.length > CUSTOM_FIELD_MATCH_LIMIT) {
    throw new LeadFilterError(400, "Điều kiện lọc Tags khớp quá nhiều lead. Vui lòng thu hẹp điều kiện.");
  }
  const leadIds = rows.map((row) => row.entity_id);
  const negate = operator === "HAS_NO_VALUE" || isNegative(operator);
  return negate ? { id: { notIn: leadIds } } : { id: { in: leadIds } };
}

/** Trường có thể lọc theo số lượng giá trị (lead có nhiều số điện thoại / nhiều nhân viên). */
const countableFields = new Set<string>(["phone", "assigneeId"]);

/** "Số lượng là N": số điện thoại = số chính + số phụ; nhân viên = chính + phụ (tối đa 2). */
async function countFieldWhere(field: string, condition: FilterCondition): Promise<Prisma.leadsWhereInput> {
  const count = condition.numberValue;
  if (count === null || count === undefined || !countableFields.has(field)) invalid();
  const none: Prisma.leadsWhereInput = { id: { in: [] } };
  if (field === "assigneeId") {
    if (count === 0) return { assigned_to: null, secondary_assigned_to: null };
    if (count === 1) {
      return { OR: [
        { assigned_to: { not: null }, secondary_assigned_to: null },
        { assigned_to: null, secondary_assigned_to: { not: null } },
      ] };
    }
    if (count === 2) return { assigned_to: { not: null }, secondary_assigned_to: { not: null } };
    return none;
  }
  // phone là cột bắt buộc nên mỗi lead có ít nhất 1 số.
  if (count === 0) return { phone: "" };
  if (count === 1) return { secondary_phones: { isEmpty: true }, NOT: { phone: "" } };
  // Prisma không lọc được theo độ dài mảng; lead nhiều số hiếm nên lấy id trước, có giới hạn như trường tùy chỉnh.
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM leads
    WHERE deleted_at IS NULL AND cardinality(secondary_phones) = ${count - 1}
    LIMIT ${CUSTOM_FIELD_MATCH_LIMIT + 1}
  `;
  if (rows.length > CUSTOM_FIELD_MATCH_LIMIT) {
    throw new LeadFilterError(400, "Điều kiện lọc khớp quá nhiều lead. Vui lòng thu hẹp điều kiện.");
  }
  return { id: { in: rows.map((row) => row.id) } };
}

/** Điều kiện trên custom_field_values cho phiên bản "dương" của toán tử. */
function customValueWhere(field: CustomField, condition: FilterCondition): Prisma.custom_field_valuesWhereInput {
  const { operator, value } = condition;
  if (operator === "HAS_VALUE" || operator === "HAS_NO_VALUE") return {};
  switch (field.type) {
    case "TEXT": case "TEXTAREA": case "EMAIL": case "PHONE": case "SELECT": case "PROVINCE":
      if (!textOperators.has(operator)) invalid();
      return { value_text: positiveTextFilter(operator, value) };
    case "MULTI_SELECT":
      if (!["CONTAINS", "NOT_CONTAINS", "EQUALS", "NOT_EQUALS"].includes(operator)) invalid();
      return { value_json: { array_contains: [textValue(value)] } };
    case "NUMBER": {
      if (operator === "EQUALS" || operator === "NOT_EQUALS") return { value_number: numberOf(value) };
      if (operator === "GT") return { value_number: { gt: numberOf(value) } };
      if (operator === "GTE") return { value_number: { gte: numberOf(value) } };
      if (operator === "LT") return { value_number: { lt: numberOf(value) } };
      if (operator === "LTE") return { value_number: { lte: numberOf(value) } };
      if (operator === "BETWEEN") {
        const [min, max] = [numberOf(value), numberOf(condition.valueTo)].sort((a, b) => a - b);
        return { value_number: { gte: min, lte: max } };
      }
      return invalid();
    }
    case "DATE": case "DATETIME":
      return { value_date: resolveDateRange(condition) };
    case "BOOLEAN":
      if (operator !== "EQUALS" && operator !== "NOT_EQUALS") invalid();
      return { value_boolean: booleanOf(value) };
    default:
      return invalid();
  }
}

async function customFieldWhere(field: CustomField, condition: FilterCondition): Promise<Prisma.leadsWhereInput> {
  const rows = await prisma.custom_field_values.findMany({
    where: { custom_field_id: field.id, entity_type: "LEAD", ...customValueWhere(field, condition) },
    select: { entity_id: true },
    take: CUSTOM_FIELD_MATCH_LIMIT + 1,
  });
  if (rows.length > CUSTOM_FIELD_MATCH_LIMIT) {
    throw new LeadFilterError(400, "Điều kiện lọc trường tùy chỉnh khớp quá nhiều lead. Vui lòng thu hẹp điều kiện.");
  }
  const leadIds = rows.map((row) => row.entity_id);
  // Giá trị bị xoá sẽ xoá luôn dòng custom_field_values, nên "không có giá trị" = không có dòng.
  const negate = condition.operator === "HAS_NO_VALUE" || isNegative(condition.operator);
  return negate ? { id: { notIn: leadIds } } : { id: { in: leadIds } };
}

async function resolveCustomFields(user: AuthUser, conditions: FilterCondition[]) {
  const ids = [...new Set(conditions.flatMap((condition) => condition.field.startsWith("cf:") ? [condition.field.slice(3)] : []))];
  if (ids.length === 0) return new Map<string, CustomField>();
  const fields = await prisma.custom_fields.findMany({
    where: { id: { in: ids }, entity_type: "LEAD", is_active: true, archived_at: null },
    select: { id: true, field_key: true, field_type: true, is_sensitive: true },
  });
  if (fields.length !== ids.length) {
    throw new LeadFilterError(400, "Trường lọc không tồn tại hoặc đã bị lưu trữ.");
  }
  const canViewSensitive = hasCustomFieldPermission(user.permissions, "LEAD", "view_sensitive");
  if (fields.some((field) => field.is_sensitive && !canViewSensitive)) {
    throw new LeadFilterError(403, "Bạn không có quyền lọc theo trường dữ liệu nhạy cảm.");
  }
  return new Map(fields.map((field) => [field.id, { id: field.id, key: field.field_key, type: field.field_type }]));
}

/**
 * Chuyển danh sách điều kiện thành 1 Prisma where, hoặc null nếu không có điều kiện.
 * Ném LeadFilterError (400/403) khi điều kiện không hợp lệ hoặc vượt quyền.
 */
export async function buildLeadFilterWhere(
  user: AuthUser,
  conditions: FilterCondition[],
  canViewSensitiveLeadData: boolean,
): Promise<Prisma.leadsWhereInput | null> {
  if (conditions.length === 0) return null;
  if (conditions.some((condition) => !condition.field.startsWith("cf:") && sensitiveSystemFields.has(condition.field as SystemFieldKey)) && !canViewSensitiveLeadData) {
    throw new LeadFilterError(403, "Bạn không có quyền lọc theo số điện thoại hoặc email.");
  }
  if (!canViewSensitiveLeadData && conditions.some((condition) => isCatalogField(condition.field) && getLeadFieldFilterDefinition(condition.field)?.isSensitive)) {
    throw new LeadFilterError(403, "Bạn không có quyền lọc theo trường dữ liệu nhạy cảm.");
  }
  const customFields = await resolveCustomFields(user, conditions);

  let combined: Prisma.leadsWhereInput | null = null;
  for (const condition of conditions) {
    const where = condition.operator === "COUNT_EQUALS"
      ? await countFieldWhere(condition.field, condition)
      : condition.field.startsWith("cf:")
        ? await customFieldWhere(customFields.get(condition.field.slice(3))!, condition)
        : isCatalogField(condition.field)
          ? await catalogFieldWhere(condition)
          : systemFieldWhere(condition.field as SystemFieldKey, condition);
    combined = combined === null
      ? where
      : condition.combinator === "OR" ? { OR: [combined, where] } : { AND: [combined, where] };
  }
  return combined;
}
