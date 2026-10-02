import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";

export type AutomationSystemFieldDefinition = {
  reference: string;
  key: string;
  label: string;
  description: string | null;
  dataType: string;
  groupKey: string;
  groupLabel: string;
  source: "system";
  isSensitive: boolean;
  optionSource?: string;
};

export const AUTOMATION_SYSTEM_FIELDS: AutomationSystemFieldDefinition[] = leadFormFieldCatalog.flatMap((group) =>
  group.fields.map((field) => ({
    reference: `system:${field.key}`,
    key: field.key,
    label: field.label,
    description: field.note ?? null,
    dataType: field.dataType,
    groupKey: group.id,
    groupLabel: group.label,
    source: "system" as const,
    isSensitive: Boolean(field.isSensitive),
    ...(field.key === "pipelineStageId"
      ? { optionSource: "pipelineStages" }
      : field.optionSource ? { optionSource: field.optionSource } : {}),
  })),
);

AUTOMATION_SYSTEM_FIELDS.push({
  reference: "system:assigneeId",
  key: "assigneeId",
  label: "Người phụ trách",
  description: "Nhân viên đang được phân công phụ trách Lead.",
  dataType: "SELECT",
  groupKey: "classification",
  groupLabel: "Chăm sóc và phân loại",
  source: "system",
  isSensitive: false,
  optionSource: "assignees",
});

export const LEGACY_AUTOMATION_FIELD_REFERENCES = new Map([
  ["source_id", "system:sourceId"], ["pipeline_stage_id", "system:pipelineStageId"],
  ["status", "system:pipelineStageId"], ["assigned_to", "system:assigneeId"],
  ["institution_program_id", "system:institutionProgramId"], ["full_name", "system:fullName"],
]);

export function normalizeAutomationFieldReference(reference: string) {
  return LEGACY_AUTOMATION_FIELD_REFERENCES.get(reference) ?? reference;
}

export function getAutomationSystemField(reference: string) {
  const normalized = normalizeAutomationFieldReference(reference);
  return AUTOMATION_SYSTEM_FIELDS.find((field) => field.reference === normalized);
}
