export type LeadListItem = {
  id: string;
  leadCode: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  birthPlace: string | null;
  cccd: string | null;
  cccdIssueDate: string | null;
  cccdIssuePlace: string | null;
  nationality: string | null;
  ethnicity: string | null;
  religion: string | null;
  specificAddress: string | null;
  graduationYear: string | null;
  graduationCertificate: string | null;
  previousGraduationCertificate: string | null;
  graduationMajor: string | null;
  graduationRank: string | null;
  diplomaIssuePlace: string | null;
  academicRank12: string | null;
  conductRank12: string | null;
  highSchoolName: string | null;
  highSchoolProvince: string | null;
  highSchoolDistrict: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  hamlet: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  currentResidence: string | null;
  currentJob: string | null;
  companyName: string | null;
  relative1FullName: string | null;
  relative1Relationship: string | null;
  relative1Phone: string | null;
  relative1Job: string | null;
  relative1Address: string | null;
  relative2FullName: string | null;
  relative2Relationship: string | null;
  relative2Phone: string | null;
  relative2Job: string | null;
  relative2Address: string | null;
  majorName: string | null;
  institutionProgram: { id: string; name: string; institutionName: string } | null;
  admissionStatusName: string | null;
  trainingCode: string | null;
  classCode: string | null;
  subjectGroupCode: string | null;
  subjectGroupName: string | null;
  score1: string | null;
  score2: string | null;
  score3: string | null;
  admissionScore: string | null;
  enrollmentBatch: string | null;
  registrationStation: string | null;
  decisionNumber: string | null;
  decisionSignedDate: string | null;
  monthlyRevenue: string | null;
  gclid: string | null;
  tags: string;
  note: string | null;
  temperature: string | null;
  status: string | null;
  source: { id: string; name: string } | null;
  pipelineStage: { id: string; name: string; color: string | null } | null;
  assignee: { id: string; fullName: string } | null;
  createdAt: string | null;
};

export type LeadSortField = "createdAt" | "fullName" | "leadCode" | "status";

export type LeadListFilters = {
  search: string;
  status: string;
  pipelineStageId: string;
  sourceId: string;
  assigneeId: string;
};

export type LeadListResponse = {
  data: LeadListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  sort: {
    sortBy: LeadSortField;
    sortOrder: "asc" | "desc";
  };
  filters: LeadListFilters;
};

export type LeadFilterOptions = {
  sources: Array<{ id: string; name: string }>;
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
  assignees: Array<{ id: string; fullName: string }>;
  statuses: string[];
  stages: Array<{ id: string; name: string; color: string | null; count: number }>;
  totalLeads: number;
};

export type LeadDetail = LeadListItem & {
  phone: string | null;
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  cccd: string | null;
  note: string | null;
  leadScore: number | null;
  temperature: string | null;
  updatedAt: string | null;
  birthPlace: string | null;
  cccdIssueDate: string | null;
  cccdIssuePlace: string | null;
  nationality: string | null;
  ethnicity: string | null;
  religion: string | null;
  graduationYear: string | null;
  graduationCertificate: string | null;
  previousGraduationCertificate: string | null;
  graduationMajor: string | null;
  graduationRank: string | null;
  diplomaIssuePlace: string | null;
  academicRank12: string | null;
  conductRank12: string | null;
  highSchoolName: string | null;
  highSchoolProvince: string | null;
  highSchoolDistrict: string | null;
  currentJob: string | null;
  companyName: string | null;
  specificAddress: string | null;
  permanentAddress: string | null;
  currentAddress: string | null;
  currentResidence: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  hamlet: string | null;
  relative1FullName: string | null;
  relative1Relationship: string | null;
  relative1Phone: string | null;
  relative1Job: string | null;
  relative1Address: string | null;
  relative2FullName: string | null;
  relative2Relationship: string | null;
  relative2Phone: string | null;
  relative2Job: string | null;
  relative2Address: string | null;
  institutionProgramId: string | null;
  majorId: string | null;
  admissionStatusId: string | null;
  trainingCode: string | null;
  classCode: string | null;
  subjectGroupCode: string | null;
  subjectGroupName: string | null;
  score1: string | null;
  score2: string | null;
  score3: string | null;
  admissionScore: string | null;
  enrollmentBatch: string | null;
  registrationStation: string | null;
  decisionNumber: string | null;
  decisionSignedDate: string | null;
  monthlyRevenue: string | null;
  gclid: string | null;
  tags: string;
  owner: { id: string; fullName: string } | null;
  assignments: Array<{
    id: string;
    assignedAt: string | null;
    isMainOwner: boolean;
    assignee: { id: string; fullName: string } | null;
    department: { id: string; name: string } | null;
  }>;
  stageHistory: Array<{
    id: string;
    changedAt: string | null;
    fromStage: { id: string; name: string } | null;
    toStage: { id: string; name: string } | null;
    changedBy: { id: string; fullName: string } | null;
  }>;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string | null;
    author: { id: string; fullName: string } | null;
  }>;
  activities: Array<{
    id: string;
    type: string;
    content: string | null;
    createdAt: string | null;
    actor: { id: string; fullName: string } | null;
  }>;
  files: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string | null;
    fileSize: string | null;
    createdAt: string | null;
    uploadedBy: { id: string; fullName: string } | null;
  }>;
};

export type LeadFormInput = {
  fullName: string;
  phone: string;
  sourceId: string;
  pipelineStageId: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  cccd: string;
  note: string;
  status: string;
  temperature: string;
  birthPlace: string;
  cccdIssueDate: string;
  cccdIssuePlace: string;
  nationality: string;
  ethnicity: string;
  religion: string;
  graduationYear: string;
  graduationCertificate: string;
  previousGraduationCertificate: string;
  graduationMajor: string;
  graduationRank: string;
  diplomaIssuePlace: string;
  academicRank12: string;
  conductRank12: string;
  highSchoolName: string;
  highSchoolProvince: string;
  highSchoolDistrict: string;
  currentJob: string;
  companyName: string;
  specificAddress: string;
  permanentAddress: string;
  currentAddress: string;
  currentResidence: string;
  province: string;
  district: string;
  ward: string;
  hamlet: string;
  relative1FullName: string;
  relative1Relationship: string;
  relative1Phone: string;
  relative1Job: string;
  relative1Address: string;
  relative2FullName: string;
  relative2Relationship: string;
  relative2Phone: string;
  relative2Job: string;
  relative2Address: string;
  institutionProgramId: string;
  majorId: string;
  admissionStatusId: string;
  trainingCode: string;
  classCode: string;
  subjectGroupCode: string;
  subjectGroupName: string;
  score1: string;
  score2: string;
  score3: string;
  admissionScore: string;
  enrollmentBatch: string;
  registrationStation: string;
  decisionNumber: string;
  decisionSignedDate: string;
  monthlyRevenue: string;
  gclid: string;
  tags: string;
  customFieldValues: Record<string, LeadCustomFieldValue>;
};

export type LeadActionOptions = {
  sources: Array<{ id: string; name: string }>;
  stages: Array<{ id: string; name: string; color: string | null; pipelineId: string | null; pipelineName: string | null }>;
  assignees: Array<{ id: string; fullName: string }>;
  departments: Array<{ id: string; name: string }>;
  institutionPrograms: Array<{ id: string; name: string; code: string; institutionName: string; programTypeName: string }>;
  majors: Array<{ id: string; name: string; code: string | null; facultyName: string | null }>;
  admissionStatuses: Array<{ id: string; name: string }>;
  tags: string[];
};

export type LeadImportError = {
  row: number;
  fullName: string | null;
  phone: string | null;
  message: string;
};

export type LeadImportResult = {
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errors: LeadImportError[];
};

export type LeadCustomFieldDataType =
  | "TEXT"
  | "TEXTAREA"
  | "NUMBER"
  | "DATE"
  | "DATETIME"
  | "BOOLEAN"
  | "SELECT"
  | "MULTI_SELECT"
  | "EMAIL"
  | "PHONE";

export type LeadCustomFieldValue = string | number | boolean | string[] | null;

export type LeadCustomFieldOption = {
  code: string;
  label: string;
  isActive: boolean;
  displayOrder: number;
};

export type LeadCustomField = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dataType: LeadCustomFieldDataType;
  isRequired: boolean;
  isSensitive: boolean;
  displayOrder: number;
  options: LeadCustomFieldOption[] | null;
  validationRules: Record<string, unknown> | null;
  defaultValue?: LeadCustomFieldValue;
  value: LeadCustomFieldValue;
  canView: boolean;
  canEdit: boolean;
};

export type LeadCustomFieldsResponse = {
  fields: LeadCustomField[];
};

export type LeadCustomFieldUpdateInput = {
  values: Array<{ fieldId: string; value: LeadCustomFieldValue }>;
};
