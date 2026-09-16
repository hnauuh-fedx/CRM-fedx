import type { LeadListFilters, LeadListResponse, LeadSortField } from "@/modules/leads/lead.types";

export type CustomerListFilterField = "fullName" | "leadCode" | "phone" | "email" | "pipelineStageId" | "sourceId" | "assigneeId" | "gender" | "dateOfBirth" | "majorId" | "createdAt";
export type CustomerListFilterOperator = "contains" | "notContains" | "equals" | "notEquals" | "isEmpty" | "isNotEmpty" | "on" | "before" | "after" | "between" | "relative";
export type CustomerListRelativeRange = "today" | "yesterday" | "thisWeek" | "lastWeek" | "last7Days" | "last30Days" | "thisMonth" | "lastMonth" | "thisQuarter" | "lastQuarter" | "thisYear" | "lastYear";
export type CustomerListFilterCondition = {
  field: CustomerListFilterField;
  operator: CustomerListFilterOperator;
  value?: string;
  from?: string;
  to?: string;
  relativeRange?: CustomerListRelativeRange;
};
export type CustomerListFilterConfig = {
  combinator: "AND" | "OR";
  conditions: CustomerListFilterCondition[];
};

export type CustomerListItem = {
  id: string;
  name: string;
  filters: CustomerListFilterConfig;
  isDynamic: boolean;
  filterDescription: string;
  customerCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerListResponse = {
  data: CustomerListItem[];
  capabilities: {
    canManage: boolean;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type CustomerListLeadParams = {
  page: number;
  limit: number;
  sortBy: LeadSortField;
  sortOrder: "asc" | "desc";
} & LeadListFilters;

export type { LeadListResponse };
