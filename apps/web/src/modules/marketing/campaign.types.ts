export type CampaignSortField = "createdAt" | "name" | "startDate" | "budget";

export type CampaignListFilters = {
  search: string;
  status: string;
  type: string;
};

export type CampaignListItem = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: number;
  createdAt: string | null;
  creator: { id: string; fullName: string } | null;
  institutionProgram: { id: string; name: string; institutionName: string } | null;
  formCount: number;
  utmTrackingCount: number;
  leadCount: number;
  applicationCount: number;
  enrolledStudentCount: number;
  conversionRate: number;
};

export type CampaignListResponse = {
  data: CampaignListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  sort: { sortBy: CampaignSortField; sortOrder: "asc" | "desc" };
  filters: CampaignListFilters;
};

export type CampaignFilterOptions = {
  statuses: string[];
  types: string[];
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
};

export type CampaignInput = {
  name: string;
  type: string;
  status: "planning" | "active" | "paused" | "completed";
  startDate: string;
  endDate: string;
  budget: number;
  institutionProgramId: string;
  customFieldValues?: Record<string, LeadCustomFieldValue>;
};
import type { LeadCustomFieldValue } from "@/modules/leads/lead.types";
