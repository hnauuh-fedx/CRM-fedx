import type {
  CampaignFilterOptions,
  CampaignListFilters,
  CampaignListResponse,
  CampaignInput,
  CampaignSortField,
} from "@/modules/marketing/campaign.types";
import { apiRequest } from "./api";
import { saveRuntimeCustomFields } from "./custom-field.service";

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

export async function createCampaign(input: CampaignInput, accessToken: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>("/campaigns", { method: "POST", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues && Object.keys(customFieldValues).length > 0) await saveRuntimeCustomFields("MARKETING_CAMPAIGN", result.id, customFieldValues, accessToken);
  return result;
}

export async function updateCampaign(campaignId: string, input: CampaignInput, accessToken: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>(`/campaigns/${campaignId}`, { method: "PATCH", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues) await saveRuntimeCustomFields("MARKETING_CAMPAIGN", campaignId, customFieldValues, accessToken);
  return result;
}

export function deleteCampaign(campaignId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/campaigns/${campaignId}`, { method: "DELETE" }, accessToken);
}
