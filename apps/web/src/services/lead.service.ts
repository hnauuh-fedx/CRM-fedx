import type {
  LeadActionOptions,
  LeadBulkUpdateField,
  LeadBulkUpdateOptions,
  LeadBulkUpdateResult,
  LeadDetail,
  LeadFilterOptions,
  LeadCustomFieldsResponse,
  LeadCustomFieldUpdateInput,
  LeadListFilters,
  LeadListResponse,
  LeadFormInput,
  LeadImportResult,
  LeadSortField,
  DuplicateLeadField,
  DuplicateLeadResponse,
} from "@/modules/leads/lead.types";
import { apiDownload, apiFormRequest, apiRequest } from "./api";
import type { FilterConditionState } from "@/modules/leads/filter-fields";
import { serializeConditions } from "@/modules/leads/filter-serialization";

type LeadListParams = {
  audience?: "candidates" | "students" | "all";
  page: number;
  limit: number;
  sortBy: LeadSortField;
  sortOrder: "asc" | "desc";
  filterConditions?: FilterConditionState[];
} & LeadListFilters;

function leadListQuery(params: LeadListParams) {
  const query = new URLSearchParams({
    audience: params.audience ?? "candidates",
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    pipelineStageId: params.pipelineStageId,
    status: params.status ?? "",
    sourceId: params.sourceId,
    majorId: params.majorId,
    assigneeId: params.assigneeId,
    fromDate: params.fromDate,
    toDate: params.toDate,
  });
  const filters = serializeConditions(params.filterConditions ?? []);
  if (filters) query.set("filters", filters);

  return query.toString();
}

export function getLeads(params: LeadListParams, accessToken: string) {
  return apiRequest<LeadListResponse>(`/leads?${leadListQuery(params)}`, {}, accessToken);
}

export function exportLeadPage(params: LeadListParams, accessToken: string) {
  return apiDownload(`/leads/export?${leadListQuery(params)}`, accessToken);
}

export function getLeadFilterOptions(accessToken: string, audience: "candidates" | "students" | "all" = "candidates") {
  return apiRequest<LeadFilterOptions>(`/leads/options?audience=${audience}`, {}, accessToken);
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
  return apiRequest<{ id: string; canOpen?: boolean }>("/leads", { method: "POST", headers, body: JSON.stringify(input) }, accessToken);
}

export function importLeads(file: File, accessToken: string, preview = false) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFormRequest<LeadImportResult>(preview ? "/leads/import/preview" : "/leads/import", formData, accessToken);
}

export function updateLead(leadId: string, input: LeadFormInput, accessToken: string) {
  const headers = input.institutionProgramId ? { "X-Institution-Program-Id": input.institutionProgramId } : undefined;
  return apiRequest<{ id: string }>(`/leads/${leadId}`, { method: "PATCH", headers, body: JSON.stringify(input) }, accessToken);
}

export function deleteLead(leadId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/leads/${leadId}`, { method: "DELETE" }, accessToken);
}

export function getDuplicateLeads(field: DuplicateLeadField, page: number, accessToken: string) {
  const query = new URLSearchParams({ field, page: String(page), limit: "20" });
  return apiRequest<DuplicateLeadResponse>(`/leads/duplicates?${query.toString()}`, {}, accessToken);
}

export function getDuplicateGroupMembers(field: DuplicateLeadField, key: string, page: number, accessToken: string) {
  return apiRequest<{ data: DuplicateLeadResponse["data"][number]["leads"]; pagination: DuplicateLeadResponse["pagination"] }>(
    "/leads/duplicates/members", { method: "POST", body: JSON.stringify({ field, key, page, limit: 20 }) }, accessToken,
  );
}

export function deleteLeads(leadIds: string[], accessToken: string) {
  return apiRequest<{ leadIds: string[]; deletedCount: number }>(
    "/leads/bulk-delete",
    { method: "POST", body: JSON.stringify({ leadIds }) },
    accessToken,
  );
}

export function changeLeadStage(leadId: string, stageId: string, accessToken: string, noteTemplateId?: string, noteContent?: string) {
  return apiRequest<{ id: string; pipelineStageId: string }>(
    `/leads/${leadId}/stage`,
    { method: "PATCH", body: JSON.stringify({ stageId, noteTemplateId, noteContent }) },
    accessToken,
  );
}

export function initializeLeadOnOpen(leadId: string, accessToken: string) {
  return apiRequest<{
    id: string;
    changed: boolean;
    assignmentOpened: boolean;
    pipelineInitializationIssue?: "initial_stage_unavailable";
  }>(`/leads/${leadId}/open`, { method: "POST" }, accessToken);
}

export function changeLeadStatus(leadId: string, status: "ACTIVE" | "FAIL", accessToken: string, noteTemplateId?: string, noteContent?: string) {
  return apiRequest<{
    id: string;
    status: "ACTIVE" | "FAIL";
    statusLabel: string;
    pipelineStageId: string | null;
    changed: boolean;
  }>(
    `/leads/${leadId}/status`,
    { method: "PATCH", body: JSON.stringify({ status, noteTemplateId, noteContent }) },
    accessToken,
  );
}

export function getTransitionNoteOptions(leadId: string, target: string, accessToken: string) {
  return apiRequest<import("@/modules/leads/transition-note.types").TransitionNoteOptions>(
    `/leads/${leadId}/transition-note-options?target=${encodeURIComponent(target)}`, {}, accessToken,
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
  return apiRequest<{ id: string; assigneeId: string; assignmentId: string }>(
    `/leads/${leadId}/assign`,
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

export function assignLeads(leadIds: string[], assigneeId: string, accessToken: string) {
  return apiRequest<{ leadIds: string[]; assigneeId: string; assignedCount: number }>(
    "/leads/bulk-assign",
    { method: "POST", body: JSON.stringify({ leadIds, assigneeId }) },
    accessToken,
  );
}

export function getLeadBulkUpdateOptions(accessToken: string) {
  return apiRequest<LeadBulkUpdateOptions>("/leads/bulk-update/options", {}, accessToken);
}

export function bulkUpdateLeads(leadIds: string[], field: LeadBulkUpdateField, value: string, accessToken: string) {
  return apiRequest<LeadBulkUpdateResult>(
    "/leads/bulk-update",
    { method: "POST", body: JSON.stringify({ leadIds, field, value }) },
    accessToken,
  );
}

export function changeStudentMembership(leadId: string, target: "student" | "candidate", accessToken: string) {
  return apiRequest<{ id: string; recordType: "student" | "candidate" }>(`/leads/${leadId}/membership`,
    { method: "POST", body: JSON.stringify({ target }) }, accessToken);
}
