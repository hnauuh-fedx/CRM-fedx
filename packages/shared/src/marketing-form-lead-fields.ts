import { leadFormFieldCatalog, type LeadSystemField } from "./lead-form-field-catalog.js";

/** Original Lead columns, kept in snake_case because saved forms already reference them. */
export const legacyMarketingLeadFields = [
  "full_name",
  "phone",
  "email",
  "gender",
  "date_of_birth",
  "note",
  "source_id",
  "institution_program_id",
  "major_id",
] as const;

/** Catalog fields already covered by a legacy key, or changed only through their own workflow. */
const excludedCatalogKeys = new Set([
  "fullName", "phone", "email", "gender", "dateOfBirth", "note", "sourceId", "institutionProgramId", "majorId",
  "pipelineStageId", "admissionStatusId",
]);

const catalogFields = leadFormFieldCatalog.flatMap((group) => group.fields);

/** Other Lead form fields (camelCase catalog keys) that a question can write to. */
export const extendedMarketingLeadFields = catalogFields
  .map((field) => field.key)
  .filter((key) => !excludedCatalogKeys.has(key));

export const marketingLeadMappingFields = [...legacyMarketingLeadFields, ...extendedMarketingLeadFields] as [string, ...string[]];

const legacyLabels: Record<(typeof legacyMarketingLeadFields)[number], string> = {
  full_name: "Họ và tên",
  phone: "Số điện thoại",
  email: "Email",
  gender: "Giới tính",
  date_of_birth: "Ngày sinh",
  note: "Ghi chú",
  source_id: "Nguồn lead",
  institution_program_id: "Chương trình",
  major_id: "Ngành đăng ký",
};

export function getMarketingLeadField(key: string): LeadSystemField | undefined {
  return extendedMarketingLeadFields.includes(key) ? catalogFields.find((field) => field.key === key) : undefined;
}

export function marketingLeadFieldLabel(key: string) {
  return legacyLabels[key as keyof typeof legacyLabels] ?? getMarketingLeadField(key)?.label ?? key;
}
