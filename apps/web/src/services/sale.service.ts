import type {
  ActivityFilters,
  ActivityListResponse,
  AssignmentFilters,
  AssignmentListResponse,
  ReminderFilters,
  ReminderListResponse,
  SaleFilterOptions,
  SaleKpiResponse,
} from "@/modules/sale/sale.types";
import { apiRequest } from "./api";

type ListParams<T> = {
  page: number;
  limit: number;
  sortOrder: "asc" | "desc";
} & T;

function toQuery(params: Record<string, string | number>) {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

export function getSaleFilterOptions(accessToken: string) {
  return apiRequest<SaleFilterOptions>("/sale/options", {}, accessToken);
}

export function getLeadAssignments(params: ListParams<AssignmentFilters>, accessToken: string) {
  return apiRequest<AssignmentListResponse>(`/sale/assignments?${toQuery(params)}`, {}, accessToken);
}

export function getLeadActivities(params: ListParams<ActivityFilters>, accessToken: string) {
  return apiRequest<ActivityListResponse>(`/sale/activities?${toQuery(params)}`, {}, accessToken);
}

export function createLeadActivity(
  input: { leadId: string; type: string; content: string },
  accessToken: string,
) {
  return apiRequest<{ id: string }>("/sale/activities", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateLeadActivity(
  activityId: string,
  input: { type: string; content: string },
  accessToken: string,
) {
  return apiRequest<{ id: string }>(`/sale/activities/${activityId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function getSaleReminders(params: ListParams<ReminderFilters>, accessToken: string) {
  return apiRequest<ReminderListResponse>(`/sale/reminders?${toQuery(params)}`, {}, accessToken);
}

export function createSaleReminder(
  input: { leadId: string; title: string; content?: string; remindAt: string },
  accessToken: string,
) {
  return apiRequest<{ id: string }>("/sale/reminders", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateSaleReminder(
  reminderId: string,
  input: { title: string; content?: string; remindAt: string },
  accessToken: string,
) {
  return apiRequest<{ id: string }>(`/sale/reminders/${reminderId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function completeSaleReminder(reminderId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/sale/reminders/${reminderId}/complete`, { method: "PATCH" }, accessToken);
}

export function getSaleKpi(accessToken: string) {
  return apiRequest<SaleKpiResponse>("/sale/kpi", {}, accessToken);
}
