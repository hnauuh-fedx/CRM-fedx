export type AuditLogSortField = "createdAt" | "action" | "entityType";

export type AuditLogListFilters = {
  search: string;
  action: string;
  entityType: string;
  userId: string;
  fromDate: string;
  toDate: string;
};

export type AuditLogListItem = {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  createdAt: string | null;
  actor: { id: string; fullName: string } | null;
};

export type AuditLogListResponse = {
  data: AuditLogListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  sort: { sortBy: AuditLogSortField; sortOrder: "asc" | "desc" };
  filters: AuditLogListFilters;
};

export type AuditLogDetail = AuditLogListItem & {
  ipAddress: string | null;
  oldData: unknown;
  newData: unknown;
};

export type AuditLogFilterOptions = {
  actions: string[];
  entityTypes: string[];
  users: Array<{ id: string; fullName: string }>;
};
