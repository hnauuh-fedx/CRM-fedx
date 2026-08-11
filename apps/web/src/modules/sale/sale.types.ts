export type Person = { id: string; fullName: string };
export type SimpleRef = { id: string; name: string };
export type LeadRef = { id: string; leadCode: string | null; fullName: string; status?: string | null };
export type Pagination = { page: number; limit: number; total: number; totalPages: number };

export type SaleFilterOptions = {
  assignees: Person[];
  departments: SimpleRef[];
  activityTypes: string[];
  reminderStatuses: string[];
  leads: LeadRef[];
};

export type AssignmentFilters = { search: string; assigneeId: string; departmentId: string };
export type ActivityFilters = { search: string; type: string; userId: string };
export type ReminderFilters = { search: string; status: string; userId: string };

export type AssignmentItem = {
  id: string;
  assignedAt: string | null;
  isMainOwner: boolean;
  lead: LeadRef | null;
  assignee: Person | null;
  assignedBy: Person | null;
  department: SimpleRef | null;
};

export type ActivityItem = {
  id: string;
  type: string;
  content: string | null;
  isManual: boolean;
  createdAt: string | null;
  lead: LeadRef | null;
  actor: Person | null;
};

export type ReminderItem = {
  id: string;
  title: string;
  content: string | null;
  remindAt: string;
  status: string | null;
  createdAt: string | null;
  lead: LeadRef | null;
  owner: Person | null;
};

export type AssignmentListResponse = {
  data: AssignmentItem[];
  pagination: Pagination;
  filters: AssignmentFilters;
  sort: { sortOrder: "asc" | "desc" };
};

export type ActivityListResponse = {
  data: ActivityItem[];
  pagination: Pagination;
  filters: ActivityFilters;
  sort: { sortOrder: "asc" | "desc" };
};

export type ReminderListResponse = {
  data: ReminderItem[];
  pagination: Pagination;
  filters: ReminderFilters;
  sort: { sortOrder: "asc" | "desc" };
};

export type SaleKpiResponse = {
  summary: {
    totalLeads: number;
    unassignedLeads: number;
    pendingReminders: number;
    overdueReminders: number;
    activityCount: number;
  };
  staffKpi: Array<{ id: string; name: string; total: number }>;
  pipelineBreakdown: Array<{ id: string | null; name: string; total: number }>;
};
