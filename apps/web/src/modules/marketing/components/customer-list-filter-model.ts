import { z } from "zod";
import { leadFormFieldCatalog, leadSourceFieldGroup } from "@admission-crm/shared/lead-form-field-catalog";
import type {
  CustomerListFilterField,
  CustomerListFilterOperator,
  CustomerListRelativeRange,
} from "../customer-list.types";
export type CustomerListFilterFieldDefinition = {
  value: CustomerListFilterField;
  label: string;
  type: "text" | "select" | "date" | "number";
  /** Needs `lead.sensitive.view`, as enforced by the API. */
  sensitive?: boolean;
};
const legacyFilterFields: CustomerListFilterFieldDefinition[] = [
  { value: "fullName", label: "Họ và tên", type: "text" },
  { value: "leadCode", label: "Mã Lead", type: "text" },
  { value: "phone", label: "Số điện thoại", type: "text", sensitive: true },
  { value: "email", label: "Email", type: "text", sensitive: true },
  { value: "pipelineStageId", label: "Quy trình Telesale", type: "select" },
  { value: "sourceId", label: "Nguồn HV", type: "select" },
  { value: "assigneeId", label: "Nhân viên sale", type: "select" },
  { value: "gender", label: "Giới tính", type: "select" },
  { value: "dateOfBirth", label: "Ngày sinh", type: "date" },
  { value: "majorId", label: "Ngành đăng ký", type: "select" },
  { value: "createdAt", label: "Ngày tạo", type: "date" },
];
const legacyKeys = new Set(legacyFilterFields.map((field) => field.value));
/** Every other Lead form field; tags are only filterable in the Lead list. */
export const filterFields: CustomerListFilterFieldDefinition[] = [
  ...legacyFilterFields,
  // Lead form fields plus Nhóm nguồn / Nguồn received from webhooks.
  ...[...leadFormFieldCatalog, leadSourceFieldGroup].flatMap((group) => group.fields)
    .filter((field) => !legacyKeys.has(field.key) && !["institutionProgramId", "tags", "sourceGroupUrl"].includes(field.key))
    .map((field): CustomerListFilterFieldDefinition => ({
      value: field.key,
      label: field.label,
      type: field.dataType === "NUMBER" ? "number" : field.dataType === "DATE" ? "date" : field.dataType === "SELECT" ? "select" : "text",
      sensitive: Boolean(field.isSensitive) || field.storage.startsWith("addresses."),
    })),
];

export const operatorValues: [
  CustomerListFilterOperator,
  ...CustomerListFilterOperator[],
] = [
  "contains",
  "notContains",
  "equals",
  "notEquals",
  "isEmpty",
  "isNotEmpty",
  "on",
  "before",
  "after",
  "between",
  "relative",
  "greaterThan",
  "lessThan",
];
export const relativeRangeValues: [
  CustomerListRelativeRange,
  ...CustomerListRelativeRange[],
] = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "last7Days",
  "last30Days",
  "thisMonth",
  "lastMonth",
  "thisQuarter",
  "lastQuarter",
  "thisYear",
  "lastYear",
];
export const conditionSchema = z
  .object({
    field: z.enum(
      filterFields.map((item) => item.value) as [
        CustomerListFilterField,
        ...CustomerListFilterField[],
      ],
    ),
    operator: z.enum(operatorValues),
    value: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    relativeRange: z.enum(relativeRangeValues).optional(),
  })
  .superRefine((condition, context) => {
    if (["isEmpty", "isNotEmpty"].includes(condition.operator)) return;
    if (condition.operator === "between") {
      if (!condition.from || !condition.to)
        context.addIssue({
          code: "custom",
          message: "Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.",
        });
      else if (condition.from > condition.to)
        context.addIssue({
          code: "custom",
          message: "Ngày bắt đầu không được sau ngày kết thúc.",
        });
    } else if (condition.operator === "relative") {
      if (!condition.relativeRange)
        context.addIssue({
          code: "custom",
          message: "Vui lòng chọn khoảng thời gian tương đối.",
        });
    } else if (!condition.value?.trim())
      context.addIssue({
        code: "custom",
        message: "Vui lòng nhập hoặc chọn giá trị cho từng điều kiện.",
      });
  });
export const createCustomerListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Tên danh sách phải có ít nhất 2 ký tự.")
    .max(255),
  filters: z.object({
    combinator: z.enum(["AND", "OR"]),
    conditions: z.array(conditionSchema).max(10),
  }),
});
export type CreateCustomerListFormValues = z.infer<
  typeof createCustomerListSchema
>;
export const createCustomerListDefaults: CreateCustomerListFormValues = {
  name: "",
  filters: { combinator: "AND", conditions: [] },
};
