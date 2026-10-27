import type { Pagination } from "./marketing-reference.types";

export type LeadChannelSortField = "createdAt" | "name";
export type LeadChannelStatusFilter = "" | "active" | "inactive";
export type LeadChannelFilters = { search: string; status: LeadChannelStatusFilter };

/** One "Nguồn" value of the working program (not Nguồn học viên). */
export type LeadChannelItem = {
  id: string;
  name: string;
  isActive: boolean;
  /** Added automatically from inbound data; shown with "*" until a user saves its name. */
  isAutoCreated: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeadChannelListResponse = {
  data: LeadChannelItem[];
  pagination: Pagination;
  sort: { sortBy: LeadChannelSortField; sortOrder: "asc" | "desc" };
  filters: LeadChannelFilters;
};
