import { leadFormFieldCatalog } from "@/modules/custom-fields/lead-form-field-catalog";
import type {
  AutomationCustomDataField,
  AutomationDataField,
  AutomationDataFieldOption,
} from "./automation.types";

const legacyReferences: Record<string, string> = {
  source_id: "system:sourceId",
  pipeline_stage_id: "system:pipelineStageId",
  assigned_to: "system:assigneeId",
  status: "system:status",
  gender: "system:gender",
};

const operationalFields: AutomationDataField[] = [
  {
    reference: "system:pipelineStageId",
    key: "pipelineStageId",
    label: "Giai đoạn Pipeline",
    description: "Giai đoạn hiện tại của Lead trong Pipeline.",
    dataType: "SELECT",
    groupKey: "classification",
    groupLabel: "Chăm sóc và phân loại",
    source: "system",
    isSensitive: false,
    options: [],
  },
  {
    reference: "system:assigneeId",
    key: "assigneeId",
    label: "Người phụ trách",
    description: "Nhân viên đang được phân công phụ trách Lead.",
    dataType: "SELECT",
    groupKey: "classification",
    groupLabel: "Chăm sóc và phân loại",
    source: "system",
    isSensitive: false,
    options: [],
  },
];

export function buildAutomationDataFields(
  customFields: AutomationCustomDataField[],
  canViewSensitiveLeadData: boolean,
  systemFieldOptions: Record<string, AutomationDataFieldOption[]> = {},
): AutomationDataField[] {
  const systemFields = leadFormFieldCatalog.flatMap((group) =>
    group.fields
      .filter((field) => canViewSensitiveLeadData || !field.isSensitive)
      .map((field) => ({
        reference: `system:${field.key}`,
        key: field.key,
        label: field.label,
        description: field.note ?? null,
        dataType: field.dataType,
        groupKey: group.id,
        groupLabel: group.label,
        source: "system" as const,
        isSensitive: Boolean(field.isSensitive),
        options: field.optionSource ? (systemFieldOptions[field.optionSource] ?? []) : [],
      })),
  );

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

  return [...systemFields, ...operationalFields, ...configuredFields];
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
