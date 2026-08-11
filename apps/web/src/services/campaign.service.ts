import type {
  CampaignFilterOptions,
  CampaignListFilters,
  CampaignListResponse,
  CampaignInput,
  CampaignSortField,
} from "@/modules/marketing/campaign.types";
import { apiRequest } from "./api";

type CampaignListParams = {
  page: number;
  limit: number;
  sortBy: CampaignSortField;
  sortOrder: "asc" | "desc";
} & CampaignListFilters;

export function getCampaigns(params: CampaignListParams, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    status: params.status,
    type: params.type,
  });

  return apiRequest<CampaignListResponse>(`/campaigns?${query.toString()}`, {}, accessToken);
}

export function getCampaignFilterOptions(accessToken: string) {
  return apiRequest<CampaignFilterOptions>("/campaigns/options", {}, accessToken);
}

export function createCampaign(input: CampaignInput, accessToken: string) {
  return apiRequest<{ id: string }>("/campaigns", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateCampaign(campaignId: string, input: CampaignInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/campaigns/${campaignId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteCampaign(campaignId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/campaigns/${campaignId}`, { method: "DELETE" }, accessToken);
}
