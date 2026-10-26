import type { UseFormReturn } from "react-hook-form";
import { getLeadFieldGroup, leadFieldGroupOrder } from "@admission-crm/shared/lead-field-groups";
import { normalizeMarketingFormOptions } from "@admission-crm/shared/marketing-form-config";
import { marketingLeadFieldLabel, marketingLeadMappingFields } from "@admission-crm/shared/marketing-form-lead-fields";
import type { GroupedFieldOption } from "@/components/shared/grouped-field-picker";
import type {
  MarketingFormField,
  MarketingFormFieldType,
  MarketingFormInput,
  MarketingFormLeadField,
} from "./marketing-reference.types";

export const leadFieldLabels: Record<MarketingFormLeadField, string> = Object.fromEntries(
  marketingLeadMappingFields.map((field) => [field, marketingLeadFieldLabel(field)]),
);
/** CRM targets for a question, grouped by Lead form cluster; the "none" choice stays on top without a heading. */
export function marketingLeadFieldOptions(
  targets: MarketingFormLeadField[],
  none: { value: string; label: string },
  labelPrefix = "",
): GroupedFieldOption[] {
  const grouped = targets
    .map((target, index) => {
      const group = getLeadFieldGroup(target) ?? { id: "basic", label: "Thông tin cơ bản" };
      return { option: { value: target, label: `${labelPrefix}${marketingLeadFieldLabel(target)}`, groupKey: group.id, groupLabel: group.label }, index };
    })
    .sort((left, right) => leadFieldGroupOrder(left.option.groupKey) - leadFieldGroupOrder(right.option.groupKey) || left.index - right.index)
    .map(({ option }) => option);
  return [{ value: none.value, label: none.label, groupKey: "", groupLabel: "" }, ...grouped];
}

export const fieldTypeLabels: Record<MarketingFormFieldType, string> = {
  text: "Văn bản",
  textarea: "Nội dung dài",
  phone: "Số điện thoại",
  email: "Email",
  number: "Số",
  select: "Danh sách chọn",
  radio: "Chọn một (radio)",
  checkbox: "Chọn nhiều (ô chọn)",
  date: "Ngày",
  province: "Tỉnh/Thành phố",
  file: "Tệp đính kèm",
  hidden: "Ẩn",
  single_select: "Một lựa chọn",
  multi_select: "Nhiều lựa chọn",
  rating: "Đánh giá",
};
export const optionFieldTypes = new Set<MarketingFormFieldType>([
  "select",
  "single_select",
  "multi_select",
  "radio",
  "checkbox",
]);
export type FieldDependencyConfig = {
  parentFieldKey: string;
  optionMap: Record<string, string[]>;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getFieldDependency(
  validationRules: unknown,
): FieldDependencyConfig | null {
  const dependency = asRecord(asRecord(validationRules).dependency);
  const parentFieldKey =
    typeof dependency.parentFieldKey === "string"
      ? dependency.parentFieldKey
      : "";
  const rawOptionMap = asRecord(dependency.optionMap);
  if (!parentFieldKey) return null;
  const optionMap: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(rawOptionMap)) {
    optionMap[key] = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }
  return { parentFieldKey, optionMap };
}

export function setFieldDependency(
  form: UseFormReturn<MarketingFormInput>,
  index: number,
  dependency: FieldDependencyConfig | null,
) {
  const validationRules = asRecord(
    form.getValues(`fields.${index}.validationRules`),
  );
  if (!dependency) {
    const rest = { ...validationRules };
    delete rest.dependency;
    form.setValue(`fields.${index}.validationRules`, rest, {
      shouldDirty: true,
      shouldValidate: true,
    });
    return;
  }
  form.setValue(
    `fields.${index}.validationRules`,
    { ...validationRules, dependency },
    { shouldDirty: true, shouldValidate: true },
  );
}

export function getEffectiveFieldOptions(
  field: Pick<MarketingFormField, "options" | "validationRules">,
  fields: MarketingFormField[],
  values: Record<string, string>,
) {
  const dependency = getFieldDependency(field.validationRules);
  const options = normalizeMarketingFormOptions(field.options);
  if (!dependency) return options;
  const parentValue = values[dependency.parentFieldKey] ?? "";
  if (!parentValue) return [];
  const allowedValues = new Set(dependency.optionMap[parentValue] ?? []);
  return options.filter((option) => allowedValues.has(option.value));
}
