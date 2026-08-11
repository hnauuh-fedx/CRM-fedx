import type {
  LeadSourceFilterOptions,
  LeadSourceFilters,
  LeadSourceListResponse,
  LeadSourceSortField,
  MarketingFormFilterOptions,
  MarketingFormFilters,
  MarketingFormListResponse,
  MarketingFormInput,
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

export function getMarketingForms(params: MarketingFormParams, accessToken: string) {
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
  return apiRequest<MarketingFormListResponse>(`/forms?${query.toString()}`, {}, accessToken);
}

export function getMarketingFormFilterOptions(accessToken: string) {
  return apiRequest<MarketingFormFilterOptions>("/forms/options", {}, accessToken);
}

export function createMarketingForm(input: MarketingFormInput, accessToken: string) {
  return apiRequest<{ id: string; slug?: string; public_key?: string; webhookSecret?: string }>("/forms", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function getMarketingForm(formId: string, accessToken: string) {
  return apiRequest<MarketingFormItem>(`/forms/${formId}`, {}, accessToken);
}

export function updateMarketingForm(formId: string, input: MarketingFormInput, accessToken: string) {
  return apiRequest<{ id: string; slug?: string }>(`/forms/${formId}`, { method: "PUT", body: JSON.stringify(input) }, accessToken);
}

export function publishMarketingForm(formId: string, accessToken: string) {
  return apiRequest<{ id: string; status: string; publicPath: string | null }>(`/forms/${formId}/publish`, { method: "POST" }, accessToken);
}

export function duplicateMarketingForm(formId: string, accessToken: string) {
  return apiRequest<{ id: string; slug: string | null }>(`/forms/${formId}/duplicate`, { method: "POST" }, accessToken);
}

export function rotateMarketingFormWebhookSecret(formId: string, accessToken: string) {
  return apiRequest<{ id: string; webhookSecret: string }>(`/marketing-forms/${formId}/rotate-secret`, { method: "POST" }, accessToken);
}

export function getMarketingFormSubmissions(formId: string, accessToken: string, params: { page: number; limit: number; status?: string }) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    status: params.status ?? "",
  });
  return apiRequest<MarketingFormSubmissionListResponse>(`/forms/${formId}/submissions?${query.toString()}`, {}, accessToken);
}

export function deleteMarketingForm(formId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/forms/${formId}`, { method: "DELETE" }, accessToken);
}

export function getPublicMarketingForm(publicKey: string) {
  return apiRequest<PublicMarketingFormConfig>(`/public/forms/${publicKey}`);
}

export function submitPublicMarketingForm(publicKey: string, payload: Record<string, unknown>) {
  return apiRequest<{ submissionId: string; leadId: string | null; status: string; message?: string; redirectUrl?: string }>(`/public/forms/${publicKey}/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
