import {
  isMarketingFormOtherAnswer,
  type MarketingFormOtherAnswer,
} from "@admission-crm/shared/marketing-form-config";
export type MarketingFormPublicValue =
  | string
  | string[]
  | MarketingFormOtherAnswer;
export type MarketingFormPublicValues = Record<
  string,
  MarketingFormPublicValue
>;

export function isMarketingFormValueAllowed(
  value: MarketingFormPublicValue,
  options: string[],
  multiple: boolean,
) {
  const allowedValues = new Set(options);
  if (multiple)
    return (
      Array.isArray(value) && value.every((item) => allowedValues.has(item))
    );
  return typeof value === "string" && (!value || options.includes(value));
}
export function isMarketingFormValueEmpty(value: unknown) {
  if (isMarketingFormOtherAnswer(value)) return !value.text.trim();
  return Array.isArray(value)
    ? value.length === 0
    : typeof value === "string"
      ? !value.trim()
      : value === undefined || value === null;
}
