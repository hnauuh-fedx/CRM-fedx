import type { MarketingFormField } from "./marketing-reference.types";

export function duplicateMarketingFormField(field: MarketingFormField, fields: MarketingFormField[]): MarketingFormField {
  let suffix = 1;
  const base = field.fieldKey.slice(0, 130);
  while (fields.some(item => item.fieldKey === `${base}_copy_${suffix}`)) suffix++;
  const { id: _id, ...copy } = structuredClone(field);
  // Never duplicate a CRM target: the copy is a new independent survey question.
  return { ...copy, fieldKey: `${base}_copy_${suffix}`, label: `${field.label} (bản sao)`, leadField: null, crmMappingField: null };
}
