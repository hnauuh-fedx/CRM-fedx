import { vietnamProvinces } from "@/lib/vietnam-provinces";
import type { LeadCustomField, LeadCustomFieldDataType, LeadFilterOptions } from "./lead.types";

/**
 * Hằng số & types cho bộ lọc nâng cao (filter builder).
 * Mirror backend `apps/api/src/modules/leads/lead-filter.service.ts`.
 */

export type FilterCombinator = "AND" | "OR";

export type FilterDataType = "text" | "number" | "date" | "enum" | "boolean" | "file";

export type FilterOperator =
  | "CONTAINS" | "NOT_CONTAINS" | "EQUALS" | "NOT_EQUALS" | "STARTS_WITH" | "ENDS_WITH"
  | "GT" | "GTE" | "LT" | "LTE" | "BETWEEN"
  | "IS_TODAY" | "IS_YESTERDAY" | "IS_THIS_WEEK" | "IS_LAST_WEEK" | "IS_THIS_MONTH" | "IS_LAST_MONTH"
  | "IS_QUARTER_1" | "IS_QUARTER_2" | "IS_QUARTER_3" | "IS_QUARTER_4" | "IS_X_DAYS_AGO"
  | "HAS_VALUE" | "HAS_NO_VALUE" | "COUNT_EQUALS";

/** Tên trường hệ thống hoặc `cf:<uuid>` cho trường tùy chỉnh. */
export type FilterFieldKey = string;

export type FilterValue = string | number | boolean | null | undefined;

export type FilterConditionState = {
  id: string;
  combinator?: FilterCombinator;
  field: FilterFieldKey | null;
  operator: FilterOperator | null;
  value: FilterValue;
  valueTo: FilterValue;
  numberValue: number | null;
};

export type FilterFieldDefinition = {
  key: string;
  label: string;
  group: "Thông tin cơ bản" | "Tiến trình" | "Phân công" | "Trường tùy chỉnh";
  dataType: FilterDataType;
  options?: Array<{ value: string; label: string }>;
  /** Cho phép lọc theo số lượng giá trị (vd: lead có 2 số điện thoại / 2 nhân viên). */
  maxCount?: number;
};

/** Trạng thái vòng đời lưu ở backend là ACTIVE hoặc FAIL:<stageId>. */
const statusOptions = [{ value: "ACTIVE", label: "Active" }, { value: "FAIL", label: "Fail" }];

const DATA_TYPE_MAP: Record<LeadCustomFieldDataType, FilterDataType> = {
  TEXT: "text",
  TEXTAREA: "text",
  EMAIL: "text",
  PHONE: "text",
  SELECT: "enum",
  MULTI_SELECT: "enum",
  PROVINCE: "enum",
  NUMBER: "number",
  DATE: "date",
  DATETIME: "date",
  BOOLEAN: "boolean",
  FILE: "file",
};

/**
 * Danh sách trường có thể lọc: trường hệ thống + trường tùy chỉnh user được xem.
 * SĐT/email chỉ hiện với user được xem dữ liệu nhạy cảm của lead.
 */
export function getAvailableFields(
  customFields: LeadCustomField[],
  options: LeadFilterOptions | undefined,
  canViewSensitiveLeadData: boolean,
): FilterFieldDefinition[] {
  const system: FilterFieldDefinition[] = [
    { key: "fullName", label: "Họ và tên", group: "Thông tin cơ bản", dataType: "text" },
    ...(canViewSensitiveLeadData
      ? [
          { key: "phone", label: "Số điện thoại", group: "Thông tin cơ bản", dataType: "text", maxCount: 6 } as const,
          { key: "email", label: "Email", group: "Thông tin cơ bản", dataType: "text" } as const,
        ]
      : []),
    { key: "leadCode", label: "Mã lead", group: "Thông tin cơ bản", dataType: "text" },
    { key: "dateOfBirth", label: "Ngày sinh", group: "Thông tin cơ bản", dataType: "date" },
    { key: "createdAt", label: "Ngày tạo", group: "Thông tin cơ bản", dataType: "date" },
    { key: "temperature", label: "Mức độ quan tâm", group: "Thông tin cơ bản", dataType: "text" },
    { key: "gclid", label: "GCLID", group: "Thông tin cơ bản", dataType: "text" },
    {
      key: "pipelineStageId", label: "Tiến trình", group: "Tiến trình", dataType: "enum",
      options: (options?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name })),
    },
    { key: "status", label: "Trạng thái", group: "Tiến trình", dataType: "enum", options: statusOptions },
    {
      key: "sourceId", label: "Nguồn học viên", group: "Tiến trình", dataType: "enum",
      options: (options?.sources ?? []).map((source) => ({ value: source.id, label: source.name })),
    },
    {
      key: "majorId", label: "Ngành đăng ký", group: "Tiến trình", dataType: "enum",
      options: (options?.majors ?? []).map((major) => ({ value: major.id, label: major.name })),
    },
    {
      key: "assigneeId", label: "Nhân viên phụ trách", group: "Phân công", dataType: "enum", maxCount: 2,
      options: (options?.assignees ?? []).map((assignee) => ({ value: assignee.id, label: assignee.fullName })),
    },
  ];
  const custom = customFields
    .filter((field) => field.canView)
    .map<FilterFieldDefinition>((field) => ({
      key: `cf:${field.id}`,
      label: field.name,
      group: "Trường tùy chỉnh",
      dataType: DATA_TYPE_MAP[field.dataType] ?? "text",
      options: field.dataType === "PROVINCE"
        ? vietnamProvinces.map((province) => ({ value: province.code, label: province.label }))
        : field.options
          ?.filter((option) => option.isActive)
          .map((option) => ({ value: option.code, label: option.label })),
    }));
  return [...system, ...custom];
}

export function findFieldDefinition(
  fields: FilterFieldDefinition[],
  key: string | null,
): FilterFieldDefinition | undefined {
  if (!key) return undefined;
  return fields.find((field) => field.key === key);
}
