import { normalizeMarketingFormOptions, readMarketingFormRatingMax, isMarketingFormRatingValueAllowed, type MarketingFormConfigField } from "./marketing-form-config.js";
import type { MarketingFormSubmissionPolicy } from "./marketing-form-submission-policy.js";
import type { MarketingFormLayout } from "./marketing-form-layout.js";
import { allowsMarketingFormOther, isMarketingFormOtherAnswer } from "./marketing-form-config.js";

export type MarketingFormSnapshot = {
  schemaVersion: 1;
  formId: string;
  formName: string;
  formType: string;
  institutionProgramId: string;
  configurationUpdatedAt: string | null;
  configurationVersion?: string;
  submissionPolicy?: MarketingFormSubmissionPolicy | null;
  processingOutcome?: string;
  layout?: MarketingFormLayout;
  publicReceipt?: { message: string; redirectUrl?: string; redirectMode?: "form" | "landing_page" };
  fields: Array<{
    fieldKey: string;
    label: string;
    fieldType: string;
    isRequired: boolean;
    mapping: string | null;
    options: Array<{ value: string; label: string }>;
    validationRules: Record<string, unknown>;
    defaultValue: string | null;
  }>;
};

export function createMarketingFormSnapshot(input: Omit<MarketingFormSnapshot, "schemaVersion" | "fields"> & {
  fields: Array<MarketingFormConfigField & { label: string; isRequired: boolean }>;
}): MarketingFormSnapshot {
  return JSON.parse(JSON.stringify({
    schemaVersion: 1,
    ...input,
    fields: input.fields.filter((field) => field.isActive !== false).map((field) => ({
      fieldKey: field.fieldKey, label: field.label, fieldType: field.fieldType,
      isRequired: field.isRequired, mapping: field.crmMappingField ?? field.leadField ?? null,
      options: normalizeMarketingFormOptions(field.options),
      validationRules: field.validationRules && typeof field.validationRules === "object" && !Array.isArray(field.validationRules) ? field.validationRules : {},
      defaultValue: field.defaultValue ?? null,
    })),
  })) as MarketingFormSnapshot;
}

export function describeMarketingFormAnswers(answers: unknown, snapshot?: Pick<MarketingFormSnapshot, "fields"> | null) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return [];
  return Object.entries(answers).map(([fieldKey, answer]) => {
    const field = snapshot?.fields.find((item) => item.fieldKey === fieldKey);
    const labelFor = (value: unknown): string => {
      if (value === null || value === undefined) return "Chưa trả lời";
      if (allowsMarketingFormOther(field?.validationRules) && isMarketingFormOtherAnswer(value)) return `Khác: ${value.text}`;
      if (field?.fieldType === "rating" && value !== "" && isMarketingFormRatingValueAllowed(value, field.validationRules)) return `${String(value)} / ${readMarketingFormRatingMax(field.validationRules)} sao`;
      if (typeof value === "object") return JSON.stringify(value);
      return field?.options.find((option) => option.value === String(value))?.label ?? String(value);
    };
    return { fieldKey, label: field?.label ?? fieldKey, answer: Array.isArray(answer) ? answer.map(labelFor).join("; ") : labelFor(answer) };
  });
}
