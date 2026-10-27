import { leadFieldConfigurationCatalog, leadSourceFieldGroup } from "./lead-form-field-catalog.js";

export type LeadFieldGroupRef = { id: string; label: string };

/**
 * Clusters in the order of the Lead field configuration page (form groups plus "Nguồn khách hàng");
 * custom field groups reuse these ids as `group_key`.
 */
export const leadFieldGroups: LeadFieldGroupRef[] = leadFieldConfigurationCatalog.map((group) => ({ id: group.id, label: group.label }));

const sourceGroup: LeadFieldGroupRef = { id: leadSourceFieldGroup.id, label: leadSourceFieldGroup.label };
const groupByFieldKey = new Map<string, LeadFieldGroupRef>([
  ...leadFieldConfigurationCatalog.flatMap((group) => group.fields.map((field) => [field.key, { id: group.id, label: group.label }] as const)),
  // Nguồn học viên is a basic Lead form input, but every field picker lists it with the other source fields.
  ["sourceId", sourceGroup],
]);

/** Fields that are not inputs of the Lead form but still belong to one of its clusters. */
const extraFieldGroups: Record<string, string> = {
  leadCode: "basic",
  createdAt: "basic",
  secondaryPhones: "basic",
  status: "classification",
  assigneeId: "classification",
  secondaryAssigneeId: "classification",
  leadScore: "classification",
  majorName: "admission",
  admissionStatusName: "admission",
  admissionCode: "admission",
  institutionProgramName: "admission",
  institutionName: "admission",
  admissionExpiresAt: "admission",
  feeStatus: "admission",
  tuitionStatus: "admission",
};

/** snake_case column names used by Marketing forms. */
const snakeCaseAliases: Record<string, string> = {
  full_name: "fullName",
  date_of_birth: "dateOfBirth",
  source_id: "sourceId",
  institution_program_id: "institutionProgramId",
  major_id: "majorId",
};

export function getLeadFieldGroup(key: string): LeadFieldGroupRef | undefined {
  const normalized = key.replace(/^system:/, "");
  const canonical = snakeCaseAliases[normalized] ?? normalized;
  const direct = groupByFieldKey.get(canonical);
  if (direct) return direct;
  const extraGroupId = extraFieldGroups[canonical];
  return extraGroupId ? leadFieldGroups.find((group) => group.id === extraGroupId) : undefined;
}

/** Resolves the cluster of a custom field from its group key; unknown keys keep their own label. */
export function getLeadCustomFieldGroup(group: { key: string; label: string }): LeadFieldGroupRef {
  return leadFieldGroups.find((item) => item.id === group.key) ?? { id: group.key, label: group.label };
}

/** Index of a group in Lead form order; unknown groups are placed after the known clusters. */
export function leadFieldGroupOrder(groupId: string) {
  const index = leadFieldGroups.findIndex((group) => group.id === groupId);
  return index === -1 ? leadFieldGroups.length : index;
}

/** Lowercases and strips Vietnamese diacritics so "Công nghệ" matches "cong nghe". */
export function normalizeVietnameseText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
