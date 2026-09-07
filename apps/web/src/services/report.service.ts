import type {
  AdmissionDetailReportResponse,
  MarketingDetailReportResponse,
  OverviewReportOptions,
  OverviewReportResponse,
  SaleDetailReportResponse,
  StudentDetailReportResponse,
  MetabaseDashboard,
  MetabaseGuestToken,
  PersonalReport,
  PersonalReportDefinition,
  PersonalReportDatasetDefinition,
  PersonalReportInput,
  PersonalReportResult,
  PersonalReportDatasetKey,
  PersonalDashboardConfig,
  PersonalDashboardResponse,
  DashboardKpiWidgetInput,
} from "@/modules/reports/report.types";
import { apiDownload, apiRequest } from "./api";

type DetailReportParams = {
  fromDate: string;
  toDate: string;
};

export function getOverviewReport(accessToken: string) {
  return apiRequest<OverviewReportResponse>("/reports/overview", {}, accessToken);
}

export function getOverviewReportOptions(accessToken: string) {
  return apiRequest<OverviewReportOptions>("/reports/overview/options", {}, accessToken);
}

export function getMarketingDetailReport(params: DetailReportParams, accessToken: string) {
  const query = new URLSearchParams(params);
  return apiRequest<MarketingDetailReportResponse>(`/reports/marketing-detail?${query.toString()}`, {}, accessToken);
}

export function getSaleDetailReport(params: DetailReportParams, accessToken: string) {
  const query = new URLSearchParams(params);
  return apiRequest<SaleDetailReportResponse>(`/reports/sale-detail?${query.toString()}`, {}, accessToken);
}

export function getAdmissionDetailReport(params: DetailReportParams, accessToken: string) {
  const query = new URLSearchParams(params);
  return apiRequest<AdmissionDetailReportResponse>(`/reports/admission-detail?${query.toString()}`, {}, accessToken);
}

export function getStudentDetailReport(params: DetailReportParams, accessToken: string) {
  const query = new URLSearchParams(params);
  return apiRequest<StudentDetailReportResponse>(`/reports/student-detail?${query.toString()}`, {}, accessToken);
}

export function getPersonalReportOptions(accessToken: string) {
  return apiRequest<{ modules: PersonalReportDefinition[]; datasets: PersonalReportDatasetDefinition[] }>("/reports/personal/options", {}, accessToken);
}

export function getPersonalReportFilterValues(datasetKey: PersonalReportDatasetKey, fieldKey: string, accessToken: string) {
  const query = new URLSearchParams({ datasetKey, fieldKey });
  return apiRequest<{ items: Array<{ value: string; label: string; count: number }> }>(`/reports/personal/filter-values?${query.toString()}`, {}, accessToken);
}

export function listPersonalReports(accessToken: string) {
  return apiRequest<{ items: PersonalReport[]; total: number }>("/reports/personal?limit=50", {}, accessToken);
}

export function createPersonalReport(input: PersonalReportInput, accessToken: string) {
  return apiRequest<PersonalReport>("/reports/personal", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updatePersonalReport(id: string, input: PersonalReportInput, accessToken: string) {
  return apiRequest<PersonalReport>(`/reports/personal/${id}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function setPersonalReportSharing(id: string, isShared: boolean, accessToken: string) {
  return apiRequest<PersonalReport>(`/reports/personal/${id}/sharing`, { method: "PATCH", body: JSON.stringify({ isShared }) }, accessToken);
}

export function archivePersonalReport(id: string, accessToken: string) {
  return apiRequest<void>(`/reports/personal/${id}`, { method: "DELETE" }, accessToken);
}

export function getPersonalReportResult(id: string, accessToken: string) {
  return apiRequest<PersonalReportResult>(`/reports/personal/${id}/result`, {}, accessToken);
}

export function getPersonalDashboardConfig(accessToken: string) {
  return apiRequest<PersonalDashboardConfig>("/reports/personal/dashboard/config", {}, accessToken);
}

export function updatePersonalDashboardConfig(
  reportIds: string[],
  accessToken: string,
  customization?: { columnCount: number; kpiWidgets: DashboardKpiWidgetInput[] },
) {
  return apiRequest<PersonalDashboardConfig>("/reports/personal/dashboard/config", {
    method: "PUT",
    body: JSON.stringify({ reportIds, ...customization }),
  }, accessToken);
}

export function getPersonalDashboard(accessToken: string) {
  return apiRequest<PersonalDashboardResponse>("/reports/personal/dashboard", {}, accessToken);
}

export function exportPersonalReport(id: string, format: "csv" | "xlsx", accessToken: string) {
  return apiDownload(`/reports/personal/${id}/export?format=${format}`, accessToken);
}

export function getMetabaseDashboards(accessToken: string) {
  return apiRequest<{ items: MetabaseDashboard[] }>("/reports/metabase/dashboards", {}, accessToken);
}

export function getMetabaseGuestToken(dashboardKey: MetabaseDashboard["key"], accessToken: string) {
  return apiRequest<MetabaseGuestToken>("/reports/metabase/guest-token", { method: "POST", body: JSON.stringify({ dashboardKey }) }, accessToken);
}
