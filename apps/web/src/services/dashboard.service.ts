import type { DirectorDashboardFilters, DirectorDashboardResponse } from "@/modules/dashboard/dashboard.types";
import { apiRequest } from "./api";

export function getDirectorDashboard(accessToken: string, filters: DirectorDashboardFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return apiRequest<DirectorDashboardResponse>(`/dashboard/director${query}`, {}, accessToken);
}

export function getDirectorLeadPipelineMatrix(accessToken: string, filters: DirectorDashboardFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return apiRequest<DirectorDashboardResponse["leadPipelineMatrix"]>(
    `/dashboard/director/lead-pipeline-matrix${query}`,
    {},
    accessToken,
  );
}

export function getDirectorLeadSourceBreakdown(accessToken: string, filters: DirectorDashboardFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return apiRequest<DirectorDashboardResponse["leadSourceBreakdown"]>(
    `/dashboard/director/lead-source-breakdown${query}`,
    {},
    accessToken,
  );
}
