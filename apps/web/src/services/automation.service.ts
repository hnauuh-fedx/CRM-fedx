import type {
  AutomationOptions,
  AutomationExecutionDetail,
  AutomationRuleDetail,
  AutomationRuleListResponse,
  AutomationTestLeadResponse,
  AutomationTestRunResponse,
  AutomationBulkJob,
  AutomationBulkPreview,
  AutomationExecutionListResponse,
  AutomationOperationalMetrics,
  AutomationOperationsExecutionDetail,
  AutomationRuleVersion,
} from "@/modules/automations/automation.types";
import { apiRequest } from "./api";

export type AutomationListParams = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  triggerType?: string;
  institutionProgramId?: string;
};

export type AutomationExecutionListParams = {
  page?: number;
  limit?: number;
  search?: string;
  ruleId?: string;
  status?: string;
  source?: string;
  from?: string;
  to?: string;
};

export function listAutomationRules(params: AutomationListParams, accessToken: string) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.isActive !== undefined) query.set("isActive", String(params.isActive));
  if (params.triggerType) query.set("triggerType", params.triggerType);
  if (params.institutionProgramId) query.set("institutionProgramId", params.institutionProgramId);
  return apiRequest<AutomationRuleListResponse>(`/automations?${query.toString()}`, {}, accessToken);
}

export function getAutomationRule(id: string, accessToken: string) {
  return apiRequest<AutomationRuleDetail>(`/automations/${id}`, {}, accessToken);
}

export function getAutomationOptions(accessToken: string, institutionProgramId?: string) {
  const query = new URLSearchParams();
  if (institutionProgramId) query.set("institutionProgramId", institutionProgramId);
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiRequest<AutomationOptions>(`/automations/options${suffix}`, {}, accessToken);
}

export function createAutomationRule(
  body: { name: string; description?: string; triggerType: string; graphData?: object; institutionProgramId?: string },
  accessToken: string,
) {
  return apiRequest<{ id: string; name: string }>("/automations", {
    method: "POST",
    body: JSON.stringify(body),
  }, accessToken);
}

export function updateAutomationRule(
  id: string,
  body: { name?: string; description?: string; triggerType?: string; graphData?: object; institutionProgramId?: string },
  accessToken: string,
) {
  return apiRequest<{ id: string; name: string; isActive: boolean; version: number }>(`/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }, accessToken);
}

export function getAutomationTestLeads(id: string, accessToken: string, search?: string) {
  const query = new URLSearchParams({ limit: "50" });
  if (search) query.set("search", search);
  return apiRequest<AutomationTestLeadResponse>(`/automations/${id}/test-leads?${query.toString()}`, {}, accessToken);
}

export function runAutomationTest(id: string, leadId: string, accessToken: string) {
  return apiRequest<AutomationTestRunResponse>(`/automations/${id}/test-run`, {
    method: "POST",
    body: JSON.stringify({ leadId }),
  }, accessToken);
}

export function previewAutomationBulkRun(id: string, customerListId: string, accessToken: string) {
  return apiRequest<AutomationBulkPreview>(`/automations/${id}/bulk-preview`, {
    method: "POST",
    body: JSON.stringify({ customerListId }),
  }, accessToken);
}

export function startAutomationBulkRun(id: string, customerListId: string, accessToken: string) {
  return apiRequest<AutomationBulkJob>(`/automations/${id}/bulk-run`, {
    method: "POST",
    body: JSON.stringify({ customerListId }),
  }, accessToken);
}

export function getAutomationBulkRun(id: string, jobId: string, accessToken: string) {
  return apiRequest<AutomationBulkJob>(`/automations/${id}/bulk-runs/${jobId}`, {}, accessToken);
}

export function getAutomationExecution(id: string, executionId: string, accessToken: string) {
  return apiRequest<AutomationExecutionDetail>(`/automations/${id}/logs/${executionId}`, {}, accessToken);
}

export function listAutomationExecutions(params: AutomationExecutionListParams, accessToken: string) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return apiRequest<AutomationExecutionListResponse>(`/automations/observability/executions?${query.toString()}`, {}, accessToken);
}

export function getAutomationOperationsExecution(executionId: string, accessToken: string) {
  return apiRequest<AutomationOperationsExecutionDetail>(`/automations/observability/executions/${executionId}`, {}, accessToken);
}

export function getAutomationOperationalMetrics(accessToken: string, from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiRequest<AutomationOperationalMetrics>(`/automations/observability/metrics${suffix}`, {}, accessToken);
}

export function retryAutomationExecution(executionId: string, accessToken: string) {
  return apiRequest<{ executionId: string; queued: string[]; skipped: string[] }>(
    `/automations/observability/executions/${executionId}/retry`,
    { method: "POST" },
    accessToken,
  );
}

export function replayAutomationExecution(executionId: string, requestId: string, accessToken: string) {
  return apiRequest<{ executionId: string; status: string; version: number }>(
    `/automations/observability/executions/${executionId}/replay`,
    { method: "POST", body: JSON.stringify({ requestId }) },
    accessToken,
  );
}

export function listAutomationRuleVersions(ruleId: string, accessToken: string) {
  return apiRequest<{ data: AutomationRuleVersion[] }>(`/automations/${ruleId}/versions`, {}, accessToken);
}

export function rollbackAutomationRule(ruleId: string, versionId: string, accessToken: string) {
  return apiRequest<{ id: string; name: string; version: number }>(
    `/automations/${ruleId}/versions/${versionId}/rollback`,
    { method: "POST" },
    accessToken,
  );
}

export function transferAutomationRuleOwner(ruleId: string, ownerId: string, accessToken: string) {
  return apiRequest<{ id: string; owner: { id: string; fullName: string } }>(
    `/automations/${ruleId}/owner`,
    { method: "PATCH", body: JSON.stringify({ ownerId }) },
    accessToken,
  );
}

export function listAutomationOwnerCandidates(ruleId: string, accessToken: string, search?: string) {
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  return apiRequest<{ data: Array<{ id: string; fullName: string }> }>(
    `/automations/observability/rules/${ruleId}/owners?${query.toString()}`,
    {},
    accessToken,
  );
}

export function listAutomationTransferRules(accessToken: string, search?: string) {
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  return apiRequest<{ data: Array<{ id: string; name: string; owner: { id: string; fullName: string } | null }> }>(
    `/automations/observability/transfer-rules?${query.toString()}`,
    {},
    accessToken,
  );
}

export function toggleAutomationRule(id: string, isActive: boolean, accessToken: string) {
  return apiRequest<{ id: string; name: string; isActive: boolean }>(`/automations/${id}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  }, accessToken);
}

export function duplicateAutomationRule(id: string, accessToken: string) {
  return apiRequest<{ id: string; name: string; version: number }>(`/automations/${id}/duplicate`, {
    method: "POST",
  }, accessToken);
}

export function archiveAutomationRule(id: string, accessToken: string) {
  return apiRequest<{ message: string }>(`/automations/${id}`, {
    method: "DELETE",
  }, accessToken);
}
