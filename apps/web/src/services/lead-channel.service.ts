import type { LeadChannelInput } from "@admission-crm/shared/lead-channel";
import type {
  LeadChannelFilters,
  LeadChannelItem,
  LeadChannelListResponse,
  LeadChannelSortField,
} from "@/modules/marketing/lead-channel.types";
import { apiRequest } from "./api";

type LeadChannelParams = {
  page: number;
  limit: number;
  sortBy: LeadChannelSortField;
  sortOrder: "asc" | "desc";
} & LeadChannelFilters;

const programHeaders = (institutionProgramId: string) => ({ "X-Institution-Program-Id": institutionProgramId });

export function getLeadChannels(params: LeadChannelParams, accessToken: string, institutionProgramId: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    status: params.status,
  });
  return apiRequest<LeadChannelListResponse>(`/lead-channels?${query.toString()}`, {
    headers: programHeaders(institutionProgramId),
  }, accessToken);
}

export function createLeadChannel(input: LeadChannelInput, accessToken: string, institutionProgramId: string) {
  return apiRequest<LeadChannelItem>("/lead-channels", {
    method: "POST",
    headers: programHeaders(institutionProgramId),
    body: JSON.stringify(input),
  }, accessToken);
}

export function updateLeadChannel(channelId: string, input: LeadChannelInput, accessToken: string, institutionProgramId: string) {
  return apiRequest<LeadChannelItem>(`/lead-channels/${channelId}`, {
    method: "PATCH",
    headers: programHeaders(institutionProgramId),
    body: JSON.stringify(input),
  }, accessToken);
}

export function setLeadChannelStatus(channelId: string, isActive: boolean, accessToken: string, institutionProgramId: string) {
  return apiRequest<LeadChannelItem>(`/lead-channels/${channelId}/status`, {
    method: "PATCH",
    headers: programHeaders(institutionProgramId),
    body: JSON.stringify({ isActive }),
  }, accessToken);
}
