import type { SystemFormField, SystemFormFieldGroup } from "./form-field-catalog.types";

const field = (
  key: string,
  label: string,
  dataType: SystemFormField["dataType"],
  storage: string,
  config: Omit<SystemFormField, "key" | "label" | "dataType" | "storage"> = {},
): SystemFormField => ({ key, label, dataType, storage, ...config });

const additional = (description: string): SystemFormFieldGroup => ({
  id: "additional",
  label: "Th\u00f4ng tin b\u1ed5 sung",
  description,
  fields: [],
});

export const admissionProfileFormFieldCatalog: SystemFormFieldGroup[] = [
  {
    id: "basic",
    label: "Th\u00f4ng tin h\u1ed3 s\u01a1 tuy\u1ec3n sinh",
    description: "C\u00e1c tr\u01b0\u1eddng hi\u1ec7n c\u00f3 tr\u00ean form t\u1ea1o v\u00e0 ch\u1ec9nh s\u1eeda h\u1ed3 s\u01a1 tuy\u1ec3n sinh.",
    fields: [
      field("leadId", "Lead", "SELECT", "admission_profiles.lead_id", { isRequired: true, optionSource: "Lead" }),
      field("institutionProgramId", "Ch\u01b0\u01a1ng tr\u00ecnh", "SELECT", "admission_profiles.institution_program_id", { optionSource: "Ch\u01b0\u01a1ng tr\u00ecnh tuy\u1ec3n sinh" }),
      field("majorId", "Ng\u00e0nh \u0111\u0103ng k\u00fd", "SELECT", "admission_profiles.major_id", { optionSource: "Ng\u00e0nh tuy\u1ec3n sinh" }),
      field("admissionStatusId", "Tr\u1ea1ng th\u00e1i", "SELECT", "admission_profiles.admission_status_id", { optionSource: "Tr\u1ea1ng th\u00e1i h\u1ed3 s\u01a1" }),
      field("trainingType", "H\u00ecnh th\u1ee9c \u0111\u00e0o t\u1ea1o", "TEXT", "admission_profiles.training_type"),
      field("applicationReceivedDate", "Ng\u00e0y ti\u1ebfp nh\u1eadn", "DATE", "admission_profiles.application_received_date"),
      field("classCode", "M\u00e3 l\u1edbp d\u1ef1 ki\u1ebfn", "TEXT", "admission_profiles.class_code"),
      field("enrollmentBatch", "\u0110\u1ee3t nh\u1eadp h\u1ecdc", "TEXT", "admission_profiles.enrollment_batch"),
      field("admissionScore", "\u0110i\u1ec3m x\u00e9t tuy\u1ec3n", "TEXT", "admission_profiles.admission_score"),
      field("monthlyRevenue", "H\u1ecdc ph\u00ed d\u1ef1 ki\u1ebfn", "TEXT", "admission_profiles.monthly_revenue"),
      field("feeStatus", "Tr\u1ea1ng th\u00e1i ph\u00ed", "TEXT", "admission_profiles.fee_status"),
      field("tuitionStatus", "Tr\u1ea1ng th\u00e1i h\u1ecdc ph\u00ed", "TEXT", "admission_profiles.tuition_status"),
    ],
  },
  additional("C\u00e1c tr\u01b0\u1eddng t\u1ef1 c\u1ea5u h\u00ecnh cho form h\u1ed3 s\u01a1 tuy\u1ec3n sinh."),
];

export const admissionDocumentFormFieldCatalog: SystemFormFieldGroup[] = [
  {
    id: "basic",
    label: "Upload t\u00e0i li\u1ec7u h\u1ed3 s\u01a1",
    description: "C\u00e1c tr\u01b0\u1eddng hi\u1ec7n c\u00f3 tr\u00ean form upload t\u00e0i li\u1ec7u h\u1ed3 s\u01a1.",
    fields: [
      field("leadId", "H\u1ed3 s\u01a1 tuy\u1ec3n sinh", "SELECT", "admission_documents.lead_id", { isRequired: true, optionSource: "H\u1ed3 s\u01a1 tuy\u1ec3n sinh" }),
      field("documentType", "Lo\u1ea1i t\u00e0i li\u1ec7u", "TEXT", "admission_documents.document_type", { isRequired: true }),
      field("fileName", "T\u00ean t\u1ec7p", "TEXT", "admission_documents.file_name"),
      field("fileUrl", "\u0110\u01b0\u1eddng d\u1eabn t\u1ec7p", "TEXT", "admission_documents.file_url"),
      field("mimeType", "\u0110\u1ecbnh d\u1ea1ng", "TEXT", "admission_documents.mime_type"),
      field("fileSize", "Dung l\u01b0\u1ee3ng byte", "NUMBER", "admission_documents.file_size"),
    ],
  },
  {
    id: "status_update",
    label: "C\u1eadp nh\u1eadt t\u00e0i li\u1ec7u h\u1ed3 s\u01a1",
    description: "Tr\u01b0\u1eddng nh\u1eadp tr\u00ean form c\u1eadp nh\u1eadt tr\u1ea1ng th\u00e1i t\u00e0i li\u1ec7u.",
    fields: [field("statusNote", "Ghi ch\u00fa x\u1eed l\u00fd", "TEXTAREA", "admission_documents.status_note")],
  },
  additional("C\u00e1c tr\u01b0\u1eddng t\u1ef1 c\u1ea5u h\u00ecnh cho form t\u00e0i li\u1ec7u h\u1ed3 s\u01a1."),
];

export const admissionStatusFormFieldCatalog: SystemFormFieldGroup[] = [
  {
    id: "basic",
    label: "Th\u00f4ng tin tr\u1ea1ng th\u00e1i h\u1ed3 s\u01a1",
    description: "C\u00e1c tr\u01b0\u1eddng hi\u1ec7n c\u00f3 tr\u00ean form th\u00eam v\u00e0 ch\u1ec9nh s\u1eeda tr\u1ea1ng th\u00e1i.",
    fields: [
      field("name", "T\u00ean tr\u1ea1ng th\u00e1i", "TEXT", "admission_statuses.name", { isRequired: true }),
      field("code", "M\u00e3", "TEXT", "admission_statuses.code", { isRequired: true }),
      field("color", "M\u00e0u", "TEXT", "admission_statuses.color"),
    ],
  },
  additional("C\u00e1c tr\u01b0\u1eddng t\u1ef1 c\u1ea5u h\u00ecnh cho form tr\u1ea1ng th\u00e1i h\u1ed3 s\u01a1."),
];

export const admissionMajorFormFieldCatalog: SystemFormFieldGroup[] = [
  {
    id: "basic",
    label: "Th\u00f4ng tin ng\u00e0nh",
    description: "C\u00e1c tr\u01b0\u1eddng hi\u1ec7n c\u00f3 tr\u00ean form th\u00eam v\u00e0 ch\u1ec9nh s\u1eeda ng\u00e0nh.",
    fields: [
      field("code", "M\u00e3 ng\u00e0nh", "TEXT", "majors.code", { isRequired: true }),
      field("name", "T\u00ean ng\u00e0nh", "TEXT", "majors.name", { isRequired: true }),
      field("facultyId", "Khoa ph\u1ee5 tr\u00e1ch", "SELECT", "majors.faculty_id", { optionSource: "Khoa" }),
    ],
  },
  additional("C\u00e1c tr\u01b0\u1eddng t\u1ef1 c\u1ea5u h\u00ecnh cho form ng\u00e0nh tuy\u1ec3n sinh."),
];
