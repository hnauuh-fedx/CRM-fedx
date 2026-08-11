import type {
  AuditLogDetail,
  AuditLogFilterOptions,
  AuditLogListFilters,
  AuditLogListResponse,
  AuditLogSortField,
} from "@/modules/audit/audit-log.types";
import { apiRequest } from "./api";

type AuditLogListParams = {
  page: number;
  limit: number;
  sortBy: AuditLogSortField;
  sortOrder: "asc" | "desc";
} & AuditLogListFilters;

export function getAuditLogs(params: AuditLogListParams, accessToken: string) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    search: params.search,
    action: params.action,
    entityType: params.entityType,
    userId: params.userId,
    fromDate: params.fromDate,
    toDate: params.toDate,
  });

  return apiRequest<AuditLogListResponse>(`/audit-logs?${query.toString()}`, {}, accessToken);
}

export function getAuditLogFilterOptions(accessToken: string) {
  return apiRequest<AuditLogFilterOptions>("/audit-logs/options", {}, accessToken);
}

export function getAuditLogDetail(id: string, accessToken: string) {
  return apiRequest<AuditLogDetail>(`/audit-logs/${id}`, {}, accessToken);
}
