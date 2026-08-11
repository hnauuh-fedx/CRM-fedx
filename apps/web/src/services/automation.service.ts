import type {
  AutomationOptions,
  AutomationRuleDetail,
  AutomationRuleListResponse,
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

export function getAutomationOptions(accessToken: string) {
  return apiRequest<AutomationOptions>(`/automations/options`, {}, accessToken);
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
  body: { name?: string; description?: string; triggerType?: string; graphData?: object; isActive?: boolean },
  accessToken: string,
) {
  return apiRequest<{ id: string; name: string; isActive: boolean; version: number }>(`/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }, accessToken);
}

export function toggleAutomationRule(id: string, isActive: boolean, accessToken: string) {
  return apiRequest<{ id: string; name: string; isActive: boolean }>(`/automations/${id}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  }, accessToken);
}

export function deleteAutomationRule(id: string, accessToken: string) {
  return apiRequest<{ message: string }>(`/automations/${id}`, {
    method: "DELETE",
  }, accessToken);
}
