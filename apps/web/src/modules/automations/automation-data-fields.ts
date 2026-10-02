import type {
  AutomationCustomDataField,
  AutomationDataField,
  AutomationDataFieldOption,
  AutomationRegistryField,
} from "./automation.types";

const legacyReferences: Record<string, string> = {
  source_id: "system:sourceId",
  pipeline_stage_id: "system:pipelineStageId",
  assigned_to: "system:assigneeId",
  status: "system:pipelineStageId",
  gender: "system:gender",
};

export function buildAutomationDataFields(
  registryFields: AutomationRegistryField[],
  customFields: AutomationCustomDataField[],
  canViewSensitiveLeadData: boolean,
  systemFieldOptions: Record<string, AutomationDataFieldOption[]> = {},
): AutomationDataField[] {
  const systemFields: AutomationDataField[] = registryFields
    .filter((field) => canViewSensitiveLeadData || !field.isSensitive)
    .map((field) => ({ ...field, options: field.optionSource ? (systemFieldOptions[field.optionSource] ?? []) : [] }));

  const configuredFields = customFields.map((field) => ({
    reference: field.reference,
    key: field.key,
    label: field.label,
    description: field.description,
    dataType: field.dataType,
    groupKey: `custom:${field.group.key}`,
    groupLabel: `${field.group.label} (tùy chỉnh)`,
    source: "custom" as const,
    isSensitive: field.isSensitive,
    options: readOptions(field.options),
  }));

  return [...systemFields, ...configuredFields];
}

export function normalizeAutomationFieldReference(reference?: string) {
  if (!reference) return undefined;
  return legacyReferences[reference] ?? reference;
}

function readOptions(value: unknown): AutomationDataFieldOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!option || typeof option !== "object") return [];
    const record = option as Record<string, unknown>;
    if (record.isActive === false || typeof record.code !== "string" || typeof record.label !== "string") return [];
    return [{ code: record.code, label: record.label }];
  });
}
