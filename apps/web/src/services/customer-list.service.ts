import type {
  CustomerListFilterConfig,
  CustomerListItem,
  CustomerListLeadParams,
  CustomerListResponse,
  LeadListResponse,
} from "@/modules/marketing/customer-list.types";
import { apiRequest } from "./api";

export function getCustomerLists(params: { page: number; limit: number; search?: string }, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search ?? "",
  });
  return apiRequest<CustomerListResponse>(`/customer-lists?${query.toString()}`, {}, accessToken);
}

export function getCustomerList(id: string, accessToken: string) {
  return apiRequest<CustomerListItem>(`/customer-lists/${id}`, {}, accessToken);
}

export function createCustomerList(input: { name: string; filters?: CustomerListFilterConfig }, accessToken: string) {
  return apiRequest<CustomerListItem>(
    "/customer-lists",
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

export function addLeadsToCustomerList(id: string, leadIds: string[], accessToken: string) {
  return apiRequest<{ id: string; addedCount: number }>(
    `/customer-lists/${id}/leads`,
    { method: "POST", body: JSON.stringify({ leadIds }) },
    accessToken,
  );
}

export function getCustomerListLeads(id: string, params: CustomerListLeadParams, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    pipelineStageId: params.pipelineStageId,
    sourceId: params.sourceId,
    assigneeId: params.assigneeId,
  });
  return apiRequest<LeadListResponse>(`/customer-lists/${id}/leads?${query.toString()}`, {}, accessToken);
}
