import type { DirectorDashboardResponse } from "@/modules/dashboard/dashboard.types";
import { apiRequest } from "./api";

export function getDirectorDashboard(accessToken: string) {
  return apiRequest<DirectorDashboardResponse>("/dashboard/director", {}, accessToken);
}
