import type {
  LeadSourceFilterOptions,
  LeadSourceFilters,
  LeadSourceListResponse,
  LeadSourceSortField,
  MarketingFormFilterOptions,
  MarketingFormFilters,
  MarketingFormListResponse,
  MarketingFormInput,
  MarketingFormItem,
  MarketingFormSortField,
  MarketingFormSubmissionListResponse,
  PublicMarketingFormConfig,
  UtmAnalyticsDimension,
  UtmAnalyticsResponse,
  UtmGeneratedLeadResponse,
  UtmTrackingFilterOptions,
  UtmTrackingFilters,
  UtmTrackingListResponse,
  UtmTrackingSortField,
} from "@/modules/marketing/marketing-reference.types";
import { apiRequest } from "./api";
import { saveRuntimeCustomFields } from "./custom-field.service";
import { marketingFormRequestOptions } from "@/modules/marketing/marketing-form-query-scope";

type LeadSourceParams = {
  page: number;
  limit: number;
  sortBy: LeadSourceSortField;
  sortOrder: "asc" | "desc";
} & LeadSourceFilters;
type UtmTrackingParams = {
  page: number;
  limit: number;
  sortBy: UtmTrackingSortField;
  sortOrder: "asc" | "desc";
} & UtmTrackingFilters;
type UtmAnalyticsParams = {
  dimension: UtmAnalyticsDimension;
  page: number;
  limit: number;
} & Omit<UtmTrackingFilters, "search">;
type UtmGeneratedLeadParams = {
  page: number;
  limit: number;
  groupSource?: string;
  groupMedium?: string;
  groupCampaign?: string;
  groupCampaignId?: string;
} & Omit<UtmTrackingFilters, "search">;
type MarketingFormParams = {
  page: number;
  limit: number;
  sortBy: MarketingFormSortField;
  sortOrder: "asc" | "desc";
} & MarketingFormFilters;

export function getLeadSources(params: LeadSourceParams, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    type: params.type,
  });
  return apiRequest<LeadSourceListResponse>(`/lead-sources?${query.toString()}`, {}, accessToken);
}

export function getLeadSourceFilterOptions(accessToken: string) {
  return apiRequest<LeadSourceFilterOptions>("/lead-sources/options", {}, accessToken);
}

export function getUtmTrackings(params: UtmTrackingParams, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    source: params.source,
    medium: params.medium,
    campaignId: params.campaignId,
    fromDate: params.fromDate,
    toDate: params.toDate,
  });
  return apiRequest<UtmTrackingListResponse>(`/utm-trackings?${query.toString()}`, {}, accessToken);
}

export function getUtmTrackingFilterOptions(accessToken: string) {
  return apiRequest<UtmTrackingFilterOptions>("/utm-trackings/options", {}, accessToken);
}

export function getUtmAnalytics(params: UtmAnalyticsParams, accessToken: string) {
  const query = new URLSearchParams({
    dimension: params.dimension,
    page: String(params.page),
    limit: String(params.limit),
    source: params.source,
    medium: params.medium,
    campaignId: params.campaignId,
    fromDate: params.fromDate,
    toDate: params.toDate,
  });
  return apiRequest<UtmAnalyticsResponse>(`/utm-trackings/analytics?${query.toString()}`, {}, accessToken);
}

export function getUtmGeneratedLeads(params: UtmGeneratedLeadParams, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    source: params.source,
    medium: params.medium,
    campaignId: params.campaignId,
    fromDate: params.fromDate,
    toDate: params.toDate,
    groupSource: params.groupSource ?? "",
    groupMedium: params.groupMedium ?? "",
    groupCampaign: params.groupCampaign ?? "",
    groupCampaignId: params.groupCampaignId ?? "",
  });
  return apiRequest<UtmGeneratedLeadResponse>(`/utm-trackings/leads?${query.toString()}`, {}, accessToken);
}

export function getMarketingForms(params: MarketingFormParams, accessToken: string, institutionProgramId?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    status: params.status,
    platform: params.platform,
    campaignId: params.campaignId,
  });
  return apiRequest<MarketingFormListResponse>(`/forms?${query.toString()}`, marketingFormRequestOptions(institutionProgramId, signal), accessToken);
}

export function getMarketingFormFilterOptions(accessToken: string, institutionProgramId?: string, signal?: AbortSignal) {
  return apiRequest<MarketingFormFilterOptions>("/forms/options", marketingFormRequestOptions(institutionProgramId, signal), accessToken);
}

export async function createMarketingForm(input: MarketingFormInput, accessToken: string, institutionProgramId?: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string; slug?: string; public_key?: string; webhookSecret?: string }>("/forms", { ...marketingFormRequestOptions(institutionProgramId), method: "POST", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues && Object.keys(customFieldValues).length > 0) await saveRuntimeCustomFields("MARKETING_FORM", result.id, customFieldValues, accessToken, institutionProgramId);
  return result;
}

export function getMarketingForm(formId: string, accessToken: string, institutionProgramId?: string, signal?: AbortSignal) {
  return apiRequest<MarketingFormItem>(`/forms/${formId}`, marketingFormRequestOptions(institutionProgramId, signal), accessToken);
}

export async function updateMarketingForm(formId: string, input: MarketingFormInput, accessToken: string, institutionProgramId?: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string; slug?: string }>(`/forms/${formId}`, { ...marketingFormRequestOptions(institutionProgramId), method: "PUT", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues) await saveRuntimeCustomFields("MARKETING_FORM", formId, customFieldValues, accessToken, institutionProgramId);
  return result;
}

export function publishMarketingForm(formId: string, accessToken: string, institutionProgramId?: string) {
  return apiRequest<{ id: string; status: string; publicPath: string | null }>(`/forms/${formId}/publish`, { ...marketingFormRequestOptions(institutionProgramId), method: "POST" }, accessToken);
}

export function duplicateMarketingForm(formId: string, accessToken: string, institutionProgramId?: string) {
  return apiRequest<{ id: string; slug: string | null }>(`/forms/${formId}/duplicate`, { ...marketingFormRequestOptions(institutionProgramId), method: "POST" }, accessToken);
}

export function rotateMarketingFormWebhookSecret(formId: string, accessToken: string, institutionProgramId?: string) {
  return apiRequest<{ id: string; webhookSecret: string }>(`/marketing-forms/${formId}/rotate-secret`, { ...marketingFormRequestOptions(institutionProgramId), method: "POST" }, accessToken);
}

export function getMarketingFormSubmissions(formId: string, accessToken: string, params: { page: number; limit: number; status?: string; search?: string }, institutionProgramId?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    status: params.status ?? "",
    search: params.search ?? "",
  });
  return apiRequest<MarketingFormSubmissionListResponse>(`/forms/${formId}/submissions?${query.toString()}`, marketingFormRequestOptions(institutionProgramId, signal), accessToken);
}

export function deleteMarketingForm(formId: string, accessToken: string, institutionProgramId?: string) {
  return apiRequest<{ id: string }>(`/forms/${formId}`, { ...marketingFormRequestOptions(institutionProgramId), method: "DELETE" }, accessToken);
}

export function getPublicMarketingForm(publicKey: string) {
  return apiRequest<PublicMarketingFormConfig>(`/public/forms/${publicKey}`);
}

export function getMarketingFormReferences(target: "major_id" | "source_id", params: { page: number; search: string }, accessToken: string, programId: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ target, page: String(params.page), limit: "20", search: params.search });
  return apiRequest<{ data: Array<{ value: string; label: string }>; pagination: { page: number; totalPages: number } }>(`/forms/references?${query}`, marketingFormRequestOptions(programId, signal), accessToken);
}

export function submitPublicMarketingForm(publicKey: string, payload: Record<string, unknown>, idempotencyKey?: string) {
  return apiRequest<{ submissionId: string; status: string; message?: string; redirectUrl?: string; redirectMode?: "form" | "landing_page" }>(`/public/forms/${publicKey}/submit`, {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: JSON.stringify(payload),
  });
}
