import type {
  LeadActionOptions,
  LeadDetail,
  LeadFilterOptions,
  LeadCustomFieldsResponse,
  LeadCustomFieldUpdateInput,
  LeadListFilters,
  LeadListResponse,
  LeadFormInput,
  LeadImportResult,
  LeadSortField,
} from "@/modules/leads/lead.types";
import { apiFormRequest, apiRequest } from "./api";

type LeadListParams = {
  page: number;
  limit: number;
  sortBy: LeadSortField;
  sortOrder: "asc" | "desc";
} & LeadListFilters;

export function getLeads(params: LeadListParams, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    status: params.status,
    pipelineStageId: params.pipelineStageId,
    sourceId: params.sourceId,
    assigneeId: params.assigneeId,
  });

  return apiRequest<LeadListResponse>(`/leads?${query.toString()}`, {}, accessToken);
}

export function getLeadFilterOptions(accessToken: string) {
  return apiRequest<LeadFilterOptions>("/leads/options", {}, accessToken);
}

export function getLead(leadId: string, accessToken: string) {
  return apiRequest<{ data: LeadDetail }>(`/leads/${leadId}`, {}, accessToken);
}

export function getLeadActionOptions(accessToken: string) {
  return apiRequest<LeadActionOptions>("/leads/action-options", {}, accessToken);
}

export function getLeadCustomFields(leadId: string, accessToken: string) {
  return apiRequest<LeadCustomFieldsResponse>(`/leads/${leadId}/custom-fields`, {}, accessToken);
}

export function getLeadCustomFieldDefinitions(institutionProgramId: string, accessToken: string) {
  const query = institutionProgramId ? `?institutionProgramId=${encodeURIComponent(institutionProgramId)}` : "";
  return apiRequest<LeadCustomFieldsResponse>(`/leads/custom-fields${query}`, {}, accessToken);
}

export function updateLeadCustomFields(leadId: string, input: LeadCustomFieldUpdateInput, accessToken: string) {
  return apiRequest<{ message: string }>(
    `/leads/${leadId}/custom-fields`,
    { method: "PATCH", body: JSON.stringify(input) },
    accessToken,
  );
}

export function createLead(input: LeadFormInput, accessToken: string) {
  const headers = input.institutionProgramId ? { "X-Institution-Program-Id": input.institutionProgramId } : undefined;
  return apiRequest<{ id: string }>("/leads", { method: "POST", headers, body: JSON.stringify(input) }, accessToken);
}

export function importLeads(file: File, accessToken: string) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFormRequest<LeadImportResult>("/leads/import", formData, accessToken);
}

export function updateLead(leadId: string, input: LeadFormInput, accessToken: string) {
  const headers = input.institutionProgramId ? { "X-Institution-Program-Id": input.institutionProgramId } : undefined;
  return apiRequest<{ id: string }>(`/leads/${leadId}`, { method: "PATCH", headers, body: JSON.stringify(input) }, accessToken);
}

export function deleteLead(leadId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/leads/${leadId}`, { method: "DELETE" }, accessToken);
}

export function changeLeadStage(leadId: string, stageId: string, accessToken: string) {
  return apiRequest<{ id: string; pipelineStageId: string }>(
    `/leads/${leadId}/stage`,
    { method: "PATCH", body: JSON.stringify({ stageId }) },
    accessToken,
  );
}

export function addLeadNote(leadId: string, content: string, accessToken: string) {
  return apiRequest<{ id: string }>(
    `/leads/${leadId}/notes`,
    { method: "POST", body: JSON.stringify({ content }) },
    accessToken,
  );
}

export function attachLeadFile(
  leadId: string,
  input: { fileName: string; fileUrl: string; mimeType?: string; fileSize?: number },
  accessToken: string,
) {
  return apiRequest<{ id: string }>(
    `/leads/${leadId}/files`,
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

export function assignLead(
  leadId: string,
  input: { assigneeId: string; departmentId?: string },
  accessToken: string,
) {
  return apiRequest<{ id: string; assigneeId: string }>(
    `/leads/${leadId}/assign`,
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}
