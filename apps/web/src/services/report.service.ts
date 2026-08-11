import type {
  AdmissionDetailReportResponse,
  MarketingDetailReportResponse,
  OverviewReportOptions,
  OverviewReportResponse,
  SaleDetailReportResponse,
  StudentDetailReportResponse,
} from "@/modules/reports/report.types";
import { apiRequest } from "./api";

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
