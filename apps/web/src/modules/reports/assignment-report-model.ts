import { z } from "zod";
import { assignmentEventTypes, type AssignmentReportFilters, type AssignmentReportQuery } from "@admission-crm/shared/assignment-report";
const vietnamCalendarFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });

export function assignmentPresetRange(preset: "TODAY" | "THIS_WEEK" | "THIS_MONTH", now = new Date()) {
  const today = vietnamCalendarFormatter.format(now);
  const day = new Date(`${today}T00:00:00Z`);
  if (preset === "THIS_MONTH") day.setUTCDate(1);
  if (preset === "THIS_WEEK") day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return { fromDate: day.toISOString().slice(0, 10), toDate: today };
}
export function defaultAssignmentFilters(now = new Date()): AssignmentReportFilters {
  return { ...assignmentPresetRange("THIS_MONTH", now), departmentIds: [], assigneeIds: [], sourceIds: [], campaignIds: [], ruleIds: [], method: "ALL", eventTypes: [...assignmentEventTypes] };
}
export const assignmentArrayFilterKeys = ["departmentIds", "assigneeIds", "sourceIds", "campaignIds", "ruleIds"] as const;
export function readAssignmentFilters(params: URLSearchParams): AssignmentReportFilters {
  const result = defaultAssignmentFilters();
  const from = params.get("assignment.fromDate"), to = params.get("assignment.toDate");
  if (z.iso.date().safeParse(from).success && z.iso.date().safeParse(to).success && from! <= to!) {
    result.fromDate = from!; result.toDate = to!;
  }
  for (const key of assignmentArrayFilterKeys) {
    result[key] = [...new Set((params.get(`assignment.${key}`) ?? "").split(",").filter((id) => z.uuid().safeParse(id).success))].slice(0, 50);
  }
  const method = params.get("assignment.method");
  if (method === "AUTOMATIC" || method === "MANUAL") result.method = method;
  if (result.method === "MANUAL") result.ruleIds = [];
  const types = (params.get("assignment.eventTypes") ?? "").split(",").filter((type): type is typeof assignmentEventTypes[number] => assignmentEventTypes.some((item) => item === type));
  if (types.length) result.eventTypes = [...new Set(types)];
  return result;
}
export function writeAssignmentFilters(params: URLSearchParams, filters: AssignmentReportFilters) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(filters)) next.set(`assignment.${key}`, Array.isArray(value) ? value.join(",") : value);
  return next;
}
export function assignmentRequestQuery(query: AssignmentReportQuery) {
  return new URLSearchParams(Object.entries(query).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : String(value)])).toString();
}
