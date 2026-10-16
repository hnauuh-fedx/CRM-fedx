import {
  normalizeMarketingFormOptions,
  isMarketingFormRatingValueAllowed,
} from "@admission-crm/shared/marketing-form-config";
import { resolveMarketingFormVisibleKeys } from "@admission-crm/shared/marketing-form-visibility";
import {
  isMarketingFormOtherAnswer,
  isMarketingFormOtherAnswerValid,
} from "@admission-crm/shared/marketing-form-config";
import {
  isMarketingFormValueAllowed,
  isMarketingFormValueEmpty,
  type MarketingFormPublicValues,
} from "./marketing-form-public-values";
import type { PublicMarketingFormConfig } from "./marketing-reference.types";
type PublicFieldConfig = PublicMarketingFormConfig["fields"][number];
type Values = MarketingFormPublicValues;
type FieldDependencyConfig = {
  parentFieldKey: string;
  optionMap: Record<string, string[]>;
};

function asRecord(value: unknown): Record<string, unknown> {
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

export function getEffectiveFieldOptions(
  field: PublicFieldConfig,
  fields: PublicFieldConfig[],
  values: Values,
) {
  const dependency = getFieldDependency(field.validationRules);
  const options = normalizeMarketingFormOptions(field.options);
  if (!dependency) return options;
  const parentValue = values[dependency.parentFieldKey] ?? "";
  if (typeof parentValue !== "string" || !parentValue) return [];
  const allowedValues = new Set(dependency.optionMap[parentValue] ?? []);
  return options.filter((option) => allowedValues.has(option.value));
}

export function marketingFormDefaults(fields: PublicFieldConfig[]): Values {
  return Object.fromEntries(
    fields.map((field) => [
      field.fieldKey,
      ["checkbox", "multi_select"].includes(field.fieldType)
        ? (field.defaultValue ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : (field.defaultValue ?? ""),
    ]),
  );
}
export function validateMarketingFormValues(
  fields: PublicFieldConfig[],
  values: Values,
  allFields = fields,
) {
  const errors: Record<string, string> = {};
  const visible = resolveMarketingFormVisibleKeys(allFields, values);
  for (const field of fields) {
    if (!visible.has(field.fieldKey)) continue;
    const value = values[field.fieldKey] ?? "";
    if (field.isRequired && isMarketingFormValueEmpty(value))
      errors[field.fieldKey] = `Vui lòng nhập ${field.label.toLowerCase()}.`;
    else if (isMarketingFormOtherAnswer(value)) {
      if (!isMarketingFormOtherAnswerValid(value, field.validationRules))
        errors[field.fieldKey] = "Vui lòng nhập nội dung Khác (1–1.000 ký tự).";
    } else if (
      field.fieldType === "rating" &&
      !isMarketingFormRatingValueAllowed(value, field.validationRules)
    )
      errors[field.fieldKey] =
        `${field.label} phải là số nguyên trong thang đánh giá.`;
    else if (
      ["select", "single_select", "multi_select", "radio", "checkbox"].includes(
        field.fieldType,
      ) &&
      !isMarketingFormValueAllowed(
        value,
        getEffectiveFieldOptions(field, allFields, values).map(
          (option) => option.value,
        ),
        ["checkbox", "multi_select"].includes(field.fieldType),
      )
    )
      errors[field.fieldKey] =
        `${field.label} không nằm trong lựa chọn hợp lệ.`;
  }
  return errors;
}
export function reconcileMarketingFormValues(
  fields: PublicFieldConfig[],
  values: Values,
): Values {
  const next = { ...values };
  // Bounded fixed-point pass also clears grandchildren when parent options change.
  for (let pass = 0; pass < fields.length; pass++) {
    let changed = false;
    const visible = resolveMarketingFormVisibleKeys(fields, next);
    for (const field of fields) {
      if (!visible.has(field.fieldKey)) {
        if (
          !isMarketingFormValueEmpty(next[field.fieldKey]) ||
          isMarketingFormOtherAnswer(next[field.fieldKey])
        ) {
          next[field.fieldKey] = ["checkbox", "multi_select"].includes(
            field.fieldType,
          )
            ? []
            : "";
          changed = true;
        }
        continue;
      }
      if (!getFieldDependency(field.validationRules)) continue;
      const value = next[field.fieldKey] ?? "";
      const multiple = ["checkbox", "multi_select"].includes(field.fieldType);
      if (
        !isMarketingFormValueAllowed(
          value,
          getEffectiveFieldOptions(field, fields, next).map(
            (option) => option.value,
          ),
          multiple,
        )
      ) {
        next[field.fieldKey] = multiple ? [] : "";
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}
