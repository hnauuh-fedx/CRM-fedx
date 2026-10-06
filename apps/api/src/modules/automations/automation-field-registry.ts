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

AUTOMATION_SYSTEM_FIELDS.push(
  {
    reference: "system:institutionProgramName", key: "institutionProgramName", label: "Chương trình tuyển sinh", description: "Tên chương trình tuyển sinh của Lead.", dataType: "TEXT", groupKey: "admission", groupLabel: "Hồ sơ tuyển sinh", source: "system", isSensitive: false,
  },
  {
    reference: "system:institutionName", key: "institutionName", label: "Đơn vị tuyển sinh", description: "Tên trường hoặc đơn vị quản lý chương trình.", dataType: "TEXT", groupKey: "admission", groupLabel: "Hồ sơ tuyển sinh", source: "system", isSensitive: false,
  },
  {
    reference: "system:majorName", key: "majorName", label: "Tên ngành đăng ký", description: "Tên ngành trong hồ sơ tuyển sinh.", dataType: "TEXT", groupKey: "admission", groupLabel: "Hồ sơ tuyển sinh", source: "system", isSensitive: false,
  },
  {
    reference: "system:admissionStatusName", key: "admissionStatusName", label: "Tên trạng thái hồ sơ", description: "Tên trạng thái tuyển sinh hiện tại.", dataType: "TEXT", groupKey: "admission", groupLabel: "Hồ sơ tuyển sinh", source: "system", isSensitive: false,
  },
  {
    reference: "system:admissionCode", key: "admissionCode", label: "Mã hồ sơ", description: "Mã hồ sơ tuyển sinh.", dataType: "TEXT", groupKey: "admission", groupLabel: "Hồ sơ tuyển sinh", source: "system", isSensitive: false,
  },
  {
    reference: "system:admissionExpiresAt", key: "admissionExpiresAt", label: "Ngày hết hạn hồ sơ", description: "Ngày hồ sơ cần hoàn tất.", dataType: "DATE", groupKey: "admission", groupLabel: "Hồ sơ tuyển sinh", source: "system", isSensitive: false,
  },
  {
    reference: "system:feeStatus", key: "feeStatus", label: "Trạng thái lệ phí", description: "Trạng thái thanh toán lệ phí tuyển sinh.", dataType: "SELECT", groupKey: "admission", groupLabel: "Hồ sơ tuyển sinh", source: "system", isSensitive: false, optionSource: "payment_statuses",
  },
  {
    reference: "system:tuitionStatus", key: "tuitionStatus", label: "Trạng thái học phí", description: "Trạng thái thanh toán học phí.", dataType: "SELECT", groupKey: "admission", groupLabel: "Hồ sơ tuyển sinh", source: "system", isSensitive: false, optionSource: "payment_statuses",
  },
);

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
