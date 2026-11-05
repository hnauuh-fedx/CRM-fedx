import type { AssignmentReportQuery, AssignmentReportResponse, AssignmentDetailResponse, AssignmentOptionKind, AssignmentFilterOption } from "@admission-crm/shared/assignment-report";
import { assignmentRequestQuery } from "@/modules/reports/assignment-report-model";
import { apiRequest } from "./api";

export function getAssignmentReport(query: AssignmentReportQuery, accessToken: string, signal?: AbortSignal) {
  return apiRequest<AssignmentReportResponse>(`/reports/assignments?${assignmentRequestQuery(query)}`, { signal }, accessToken);
}
export function getAssignmentEvents(query: AssignmentReportQuery, accessToken: string, signal?: AbortSignal) {
  return apiRequest<AssignmentDetailResponse>(`/reports/assignments/events?${assignmentRequestQuery(query)}`, { signal }, accessToken);
}
export function getAssignmentOptions(kind: AssignmentOptionKind, search: string, page: number, departmentIds: string[], accessToken: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ kind, search, page: String(page), departmentIds: departmentIds.join(",") });
  return apiRequest<{ items: AssignmentFilterOption[]; hasMore: boolean }>(`/reports/assignments/options?${query}`, { signal }, accessToken);
}
