import { getLeadCustomFieldGroup, getLeadFieldGroup, leadFieldGroupOrder } from "@admission-crm/shared/lead-field-groups";
import { leadFormFieldCatalog, leadSourceFieldGroup } from "@admission-crm/shared/lead-form-field-catalog";
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
  /** Lead form cluster (Thông tin cơ bản, Học vấn và tốt nghiệp, ...). */
  groupKey: string;
  group: string;
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
  const system: Array<Omit<FilterFieldDefinition, "group" | "groupKey">> = [
    { key: "fullName", label: "Họ và tên", dataType: "text" },
    ...(canViewSensitiveLeadData
      ? [
          { key: "phone", label: "Số điện thoại", dataType: "text", maxCount: 6 } as const,
          { key: "email", label: "Email", dataType: "text" } as const,
        ]
      : []),
    { key: "leadCode", label: "Mã lead", dataType: "text" },
    { key: "dateOfBirth", label: "Ngày sinh", dataType: "date" },
    { key: "createdAt", label: "Ngày tạo", dataType: "date" },
    { key: "temperature", label: "Mức độ quan tâm", dataType: "text" },
    { key: "gclid", label: "GCLID", dataType: "text" },
    {
      key: "pipelineStageId", label: "Tiến trình", dataType: "enum",
      options: (options?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name })),
    },
    { key: "status", label: "Trạng thái", dataType: "enum", options: statusOptions },
    {
      key: "sourceId", label: "Nguồn học viên", dataType: "enum",
      options: (options?.sources ?? []).map((source) => ({ value: source.id, label: source.name })),
    },
    {
      key: "majorId", label: "Ngành đăng ký", dataType: "enum",
      options: (options?.majors ?? []).map((major) => ({ value: major.id, label: major.name })),
    },
    {
      key: "assigneeId", label: "Nhân viên phụ trách", dataType: "enum", maxCount: 2,
      options: (options?.assignees ?? []).map((assignee) => ({ value: assignee.id, label: assignee.fullName })),
    },
  ];
  const custom = customFields
    .filter((field) => field.canView)
    .map<FilterFieldDefinition>((field) => ({
      key: `cf:${field.id}`,
      label: field.name,
      groupKey: getLeadCustomFieldGroup(field.group).id,
      group: getLeadCustomFieldGroup(field.group).label,
      dataType: DATA_TYPE_MAP[field.dataType] ?? "text",
      options: field.dataType === "PROVINCE"
        ? vietnamProvinces.map((province) => ({ value: province.code, label: province.label }))
        : field.options
          ?.filter((option) => option.isActive)
          .map((option) => ({ value: option.code, label: option.label })),
    }));
  // Every other Lead form field (profile, education, address, relatives, admission) from the shared catalog.
  const legacyKeys = new Set(system.map((field) => field.key));
  // Lead form fields plus the source data received from webhooks (Nhóm nguồn, Nguồn).
  for (const group of [...leadFormFieldCatalog, leadSourceFieldGroup]) {
    for (const field of group.fields) {
      if (legacyKeys.has(field.key) || field.key === "institutionProgramId" || field.key === "sourceGroupUrl") continue;
      if ((field.isSensitive || field.storage.startsWith("addresses.")) && !canViewSensitiveLeadData) continue;
      system.push({
        key: field.key,
        label: field.label,
        dataType: field.dataType === "NUMBER" ? "number" : field.dataType === "DATE" ? "date" : field.dataType === "SELECT" ? "enum" : "text",
        ...(field.dataType === "SELECT" ? { options: catalogOptions(field.key, options) } : {}),
      });
    }
  }
  const grouped = system.map<FilterFieldDefinition>((field) => {
    const group = getLeadFieldGroup(field.key) ?? { id: "basic", label: "Thông tin cơ bản" };
    return { ...field, groupKey: group.id, group: group.label };
  });
  // Custom fields join the Lead form cluster of their group, after that cluster's system fields.
  return [...grouped, ...custom]
    .map((field, index) => ({ field, index }))
    .sort((left, right) => leadFieldGroupOrder(left.field.groupKey) - leadFieldGroupOrder(right.field.groupKey) || left.index - right.index)
    .map(({ field }) => field);
}

const genderOptions = [{ value: "male", label: "Nam" }, { value: "female", label: "Nữ" }, { value: "other", label: "Khác" }];

function catalogOptions(key: string, options: LeadFilterOptions | undefined) {
  if (key === "gender") return genderOptions;
  if (key === "admissionStatusId") return (options?.admissionStatuses ?? []).map((status) => ({ value: status.id, label: status.name }));
  if (key === "originId") return (options?.origins ?? []).map((origin) => ({ value: origin.id, label: origin.name }));
  if (key === "source") return (options?.channels ?? []).map((channel) => ({ value: channel.id, label: channel.name }));
  return [];
}

export function findFieldDefinition(
  fields: FilterFieldDefinition[],
  key: string | null,
): FilterFieldDefinition | undefined {
  if (!key) return undefined;
  return fields.find((field) => field.key === key);
}
