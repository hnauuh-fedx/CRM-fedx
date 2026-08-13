import type {
  AdmissionFilterOptions,
  AdmissionActionOptions,
  AdmissionDebtConfirmationInput,
  AdmissionDocumentActionOptions,
  AdmissionDocumentInput,
  AdmissionDocumentListResponse,
  AdmissionDocumentStatus,
  AdmissionFeeHistoryResponse,
  AdmissionFeeListResponse,
  AdmissionFeePaymentInput,
  AdmissionListFilters,
  AdmissionListResponse,
  AdmissionProfileInput,
  AdmissionSortField,
  AdmissionStatusFlowResponse,
  AdmissionStatusInput,
  AdmissionStatusListResponse,
} from "@/modules/admissions/admission.types";
import type {
  BusinessRecordListParams,
  BusinessRecordListResponse,
} from "@/components/shared/business-records.types";
import { apiRequest } from "./api";
import { saveRuntimeCustomFields } from "./custom-field.service";

type AdmissionListParams = {
  page: number;
  limit: number;
  sortBy: AdmissionSortField;
  sortOrder: "asc" | "desc";
} & AdmissionListFilters;

export function getAdmissionProfiles(params: AdmissionListParams, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    statusId: params.statusId,
    majorId: params.majorId,
  });

  return apiRequest<AdmissionListResponse>(`/admissions?${query.toString()}`, {}, accessToken);
}

export function getAdmissionFilterOptions(accessToken: string) {
  return apiRequest<AdmissionFilterOptions>("/admissions/options", {}, accessToken);
}

export function getAdmissionActionOptions(accessToken: string) {
  return apiRequest<AdmissionActionOptions>("/admissions/action-options", {}, accessToken);
}

export async function createAdmissionProfile(input: AdmissionProfileInput, accessToken: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>("/admissions", { method: "POST", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues && Object.keys(customFieldValues).length > 0) await saveRuntimeCustomFields("ADMISSION_PROFILE", result.id, customFieldValues, accessToken);
  return result;
}

export async function updateAdmissionProfile(id: string, input: AdmissionProfileInput, accessToken: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>(`/admissions/${id}`, { method: "PUT", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues) await saveRuntimeCustomFields("ADMISSION_PROFILE", id, customFieldValues, accessToken);
  return result;
}

export function approveAdmissionProfile(id: string, statusId: string | undefined, accessToken: string) {
  return apiRequest<{ id: string; statusId: string }>(
    `/admissions/${id}/approve`,
    { method: "POST", body: JSON.stringify({ statusId }) },
    accessToken,
  );
}

export function changeAdmissionStatus(id: string, statusId: string, accessToken: string) {
  return apiRequest<{ id: string; statusId: string }>(
    `/admissions/${id}/status`,
    { method: "POST", body: JSON.stringify({ statusId }) },
    accessToken,
  );
}

export function convertAdmissionToStudent(id: string, classId: string | undefined, accessToken: string) {
  return apiRequest<{ id: string; studentCode: string }>(
    `/admissions/${id}/convert-to-student`,
    { method: "POST", body: JSON.stringify({ classId }) },
    accessToken,
  );
}

export type AdmissionDocumentSortField = "uploadedAt" | "documentType" | "status";
export type AdmissionStatusSortField = "createdAt" | "name" | "code";
export type AdmissionFeeSortField =
  | "createdAt"
  | "admissionCode"
  | "monthlyRevenue"
  | "feeStatus"
  | "tuitionStatus";

export function getAdmissionDocuments(
  params: BusinessRecordListParams<AdmissionDocumentSortField>,
  accessToken: string,
) {
  return apiRequest<BusinessRecordListResponse<AdmissionDocumentSortField>>(
    `/admissions/documents?${toBusinessQuery(params)}`,
    {},
    accessToken,
  );
}

export function getAdmissionDocumentList(
  params: BusinessRecordListParams<AdmissionDocumentSortField>,
  accessToken: string,
) {
  return apiRequest<AdmissionDocumentListResponse>(
    `/admissions/documents?${toBusinessQuery(params)}`,
    {},
    accessToken,
  );
}

export function getAdmissionDocumentOptions(accessToken: string) {
  return apiRequest<{ statuses: string[]; types: string[] }>("/admissions/documents/options", {}, accessToken);
}

export function getAdmissionDocumentActionOptions(accessToken: string) {
  return apiRequest<AdmissionDocumentActionOptions>("/admissions/documents/action-options", {}, accessToken);
}

export async function uploadAdmissionDocument(input: AdmissionDocumentInput, accessToken: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>("/admissions/documents", { method: "POST", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues && Object.keys(customFieldValues).length > 0) await saveRuntimeCustomFields("ADMISSION_DOCUMENT", result.id, customFieldValues, accessToken);
  return result;
}

export function updateAdmissionDocumentStatus(
  id: string,
  status: AdmissionDocumentStatus,
  note: string | undefined,
  accessToken: string,
) {
  return apiRequest<{ id: string; status: AdmissionDocumentStatus }>(
    `/admissions/documents/${id}/status`,
    { method: "POST", body: JSON.stringify({ status, note }) },
    accessToken,
  );
}

export function getAdmissionStatuses(
  params: BusinessRecordListParams<AdmissionStatusSortField>,
  accessToken: string,
) {
  return apiRequest<BusinessRecordListResponse<AdmissionStatusSortField>>(
    `/admissions/statuses?${toBusinessQuery(params)}`,
    {},
    accessToken,
  );
}

export function getAdmissionStatusList(
  params: BusinessRecordListParams<AdmissionStatusSortField>,
  accessToken: string,
) {
  return apiRequest<AdmissionStatusListResponse>(
    `/admissions/statuses?${toBusinessQuery(params)}`,
    {},
    accessToken,
  );
}

export function getAdmissionStatusFlow(accessToken: string) {
  return apiRequest<AdmissionStatusFlowResponse>("/admissions/statuses/flow", {}, accessToken);
}

export async function createAdmissionStatus(input: AdmissionStatusInput, accessToken: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>("/admissions/statuses", { method: "POST", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues && Object.keys(customFieldValues).length > 0) await saveRuntimeCustomFields("ADMISSION_STATUS", result.id, customFieldValues, accessToken);
  return result;
}

export async function updateAdmissionStatus(id: string, input: AdmissionStatusInput, accessToken: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>(`/admissions/statuses/${id}`, { method: "PUT", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues) await saveRuntimeCustomFields("ADMISSION_STATUS", id, customFieldValues, accessToken);
  return result;
}

export function deleteAdmissionStatus(id: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/admissions/statuses/${id}`, { method: "DELETE" }, accessToken);
}

export function updateAdmissionStatusFlow(fromStatusId: string, toStatusIds: string[], accessToken: string) {
  return apiRequest<{ fromStatusId: string; toStatusIds: string[] }>(
    "/admissions/statuses/flow",
    { method: "PUT", body: JSON.stringify({ fromStatusId, toStatusIds }) },
    accessToken,
  );
}

export function getAdmissionFees(params: BusinessRecordListParams<AdmissionFeeSortField>, accessToken: string) {
  return apiRequest<BusinessRecordListResponse<AdmissionFeeSortField>>(
    `/admissions/fees?${toBusinessQuery(params)}`,
    {},
    accessToken,
  );
}

export function getAdmissionFeeList(params: BusinessRecordListParams<AdmissionFeeSortField>, accessToken: string) {
  return apiRequest<AdmissionFeeListResponse>(
    `/admissions/fees?${toBusinessQuery(params)}`,
    {},
    accessToken,
  );
}

export function getAdmissionFeeOptions(accessToken: string) {
  return apiRequest<{ statuses: string[] }>("/admissions/fees/options", {}, accessToken);
}

export function getAdmissionFeeHistory(id: string, accessToken: string) {
  return apiRequest<AdmissionFeeHistoryResponse>(`/admissions/fees/${id}/history`, {}, accessToken);
}

export function updateAdmissionFeePayment(id: string, input: AdmissionFeePaymentInput, accessToken: string) {
  return apiRequest<{ id: string }>(
    `/admissions/fees/${id}/payment`,
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

export function confirmAdmissionFeeDebt(id: string, input: AdmissionDebtConfirmationInput, accessToken: string) {
  return apiRequest<{ id: string; debtStatus: AdmissionDebtConfirmationInput["debtStatus"] }>(
    `/admissions/fees/${id}/debt-confirmation`,
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

function toBusinessQuery<TSort extends string>(params: BusinessRecordListParams<TSort>) {
  return new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    status: params.status ?? "",
    type: params.type ?? "",
  }).toString();
}
