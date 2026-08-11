export type AdmissionSortField = "createdAt" | "admissionCode" | "applicationReceivedDate";

export type AdmissionListFilters = {
  search: string;
  statusId: string;
  majorId: string;
};

export type AdmissionListItem = {
  id: string;
  admissionCode: string | null;
  trainingType: string | null;
  classCode: string | null;
  subjectGroupCode: string | null;
  subjectGroupName: string | null;
  score1: string | null;
  score2: string | null;
  score3: string | null;
  admissionScore: string | null;
  feeStatus: string | null;
  tuitionStatus: string | null;
  monthlyRevenue: string | null;
  applicationReceivedDate: string | null;
  enrollmentBatch: string | null;
  trainingCode: string | null;
  registrationStation: string | null;
  decisionNumber: string | null;
  decisionSignedDate: string | null;
  createdAt: string | null;
  lead: { id: string; leadCode: string | null; fullName: string } | null;
  status: { id: string; name: string; color: string | null } | null;
  student: { id: string; studentCode: string } | null;
  institutionProgram: { id: string; name: string; institutionName: string } | null;
  major: {
    id: string;
    name: string;
    faculty: { id: string; name: string } | null;
  } | null;
};

export type AdmissionListResponse = {
  data: AdmissionListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  sort: { sortBy: AdmissionSortField; sortOrder: "asc" | "desc" };
  filters: AdmissionListFilters;
};

export type AdmissionFilterOptions = {
  statuses: Array<{ id: string; name: string }>;
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
  majors: Array<{ id: string; name: string; facultyName: string | null }>;
};

export type AdmissionProfileInput = {
  leadId: string;
  institutionProgramId?: string;
  majorId: string;
  admissionStatusId: string;
  trainingType?: string;
  classCode?: string;
  subjectGroupCode?: string;
  subjectGroupName?: string;
  score1?: string;
  score2?: string;
  score3?: string;
  admissionScore?: string;
  applicationReceivedDate?: string;
  enrollmentBatch?: string;
  trainingCode?: string;
  registrationStation?: string;
  decisionNumber?: string;
  decisionSignedDate?: string;
  monthlyRevenue?: string;
  feeStatus?: string;
  tuitionStatus?: string;
};

export type AdmissionActionOptions = {
  leads: Array<{ id: string; leadCode: string | null; fullName: string; phone: string }>;
  statuses: Array<{ id: string; name: string; code: string }>;
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
  majors: Array<{ id: string; name: string; facultyId: string | null; facultyName: string | null }>;
  classes: Array<{ id: string; code: string; name: string; facultyId: string | null }>;
};

export type AdmissionDocumentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "missing"
  | "supplement_requested";

export type AdmissionDocumentInput = {
  leadId: string;
  documentType: string;
  fileName?: string;
  fileUrl?: string;
  mimeType?: string;
  fileSize?: number;
};

export type AdmissionDocumentItem = {
  id: string;
  candidateName: string | null;
  leadCode: string | null;
  admissionCode: string | null;
  documentType: string;
  status: AdmissionDocumentStatus | string | null;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: string | null;
  uploadedAt: string | null;
};

export type AdmissionDocumentListResponse = {
  data: AdmissionDocumentItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  sort: { sortBy: "uploadedAt" | "documentType" | "status"; sortOrder: "asc" | "desc" };
};

export type AdmissionDocumentActionOptions = {
  profiles: Array<{ leadId: string; admissionCode: string | null; candidateName: string; leadCode: string | null }>;
  statuses: AdmissionDocumentStatus[];
  types: string[];
};

export type AdmissionStatusInput = {
  name: string;
  code: string;
  color?: string;
};

export type AdmissionStatusItem = {
  id: string;
  name: string;
  code: string;
  color: string | null;
  profileCount: number;
  createdAt: string | null;
};

export type AdmissionStatusListResponse = {
  data: AdmissionStatusItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  sort: { sortBy: "createdAt" | "name" | "code"; sortOrder: "asc" | "desc" };
};

export type AdmissionStatusFlowResponse = {
  statuses: Array<{ id: string; name: string; code: string; color: string | null }>;
  flow: Record<string, string[]>;
};

export type AdmissionFeeItem = {
  id: string;
  admissionCode: string | null;
  leadId: string | null;
  institutionProgramId: string | null;
  candidateName: string | null;
  leadCode: string | null;
  majorName: string | null;
  facultyName: string | null;
  feeStatus: string | null;
  tuitionStatus: string | null;
  monthlyRevenue: string | null;
  createdAt: string | null;
};

export type AdmissionFeeListResponse = {
  data: AdmissionFeeItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  sort: { sortBy: "createdAt" | "admissionCode" | "monthlyRevenue" | "feeStatus" | "tuitionStatus"; sortOrder: "asc" | "desc" };
};

export type AdmissionFeePaymentInput = {
  feeStatus?: string;
  tuitionStatus?: string;
  monthlyRevenue?: string;
  paymentAmount?: string;
  paymentMethod?: string;
  paidAt?: string;
  note?: string;
};

export type AdmissionDebtConfirmationInput = {
  debtStatus: "confirmed" | "pending" | "disputed";
  note?: string;
};

export type AdmissionFeeHistoryResponse = {
  profile: { id: string; admissionCode: string | null; candidateName: string | null };
  data: Array<{
    id: string;
    action: string;
    oldData: unknown;
    newData: unknown;
    createdAt: string | null;
    actorName: string | null;
  }>;
};
