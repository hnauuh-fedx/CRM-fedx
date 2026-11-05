export const assignmentEventTypes = ["ASSIGNED", "WARNING_1", "WARNING_2", "WITHDRAWN"] as const;
export type AssignmentEventType = typeof assignmentEventTypes[number];
export const assignmentEventLabels: Record<AssignmentEventType, string> = {
  ASSIGNED: "Lượt giao", WARNING_1: "Cảnh báo lần 1", WARNING_2: "Cảnh báo lần 2", WITHDRAWN: "Lượt thu hồi",
};
export const assignmentReportPermissions = ["report.view_all", "report.sale.view_department", "report.sale.view_assigned"] as const;
export type AssignmentReportFilters = {
  fromDate: string;
  toDate: string;
  departmentIds: string[];
  assigneeIds: string[];
  sourceIds: string[];
  campaignIds: string[];
  ruleIds: string[];
  method: "ALL" | "AUTOMATIC" | "MANUAL";
  eventTypes: AssignmentEventType[];
};
export type AssignmentReportQuery = AssignmentReportFilters & {
  page: number; limit: number;
  sortBy: "name" | AssignmentEventType;
  sortOrder: "asc" | "desc";
};
export type AssignmentCounts = Record<AssignmentEventType, number>;
export type AssignmentReportRow = AssignmentCounts & { assigneeId: string; name: string };
export type AssignmentReportResponse = {
  summary: AssignmentCounts;
  rows: AssignmentReportRow[];
  pagination: { page: number; limit: number; total: number };
  recordedFrom: string;
};
export type AssignmentEventDetail = {
  id: string; occurredAt: string; type: AssignmentEventType;
  assigneeName: string; leadId: string | null; leadCode: string | null; leadName: string | null;
  sourceName: string | null; campaignNames: string[]; ruleName: string | null; nodeId: string | null;
  method: "AUTOMATIC" | "MANUAL"; reason: string;
};
export type AssignmentDetailResponse = {
  rows: AssignmentEventDetail[];
  pagination: { page: number; limit: number; total: number };
};
export const assignmentOptionKinds = ["department", "assignee", "source", "campaign", "rule"] as const;
export type AssignmentOptionKind = typeof assignmentOptionKinds[number];
export type AssignmentFilterOption = { id: string; name: string };
