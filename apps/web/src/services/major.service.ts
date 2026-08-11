import type {
  MajorInput,
  MajorListResponse,
  MajorManagementOptions,
  MajorSortField,
} from "@/modules/admissions/major-management.types";
import { apiRequest } from "./api";

export function getProgramMajors(
  params: { page: number; limit: number; search: string; sortBy: MajorSortField; sortOrder: "asc" | "desc" },
  accessToken: string,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  return apiRequest<MajorListResponse>(`/majors?${query.toString()}`, {}, accessToken);
}

export function getMajorManagementOptions(accessToken: string) {
  return apiRequest<MajorManagementOptions>("/majors/options", {}, accessToken);
}

export function createProgramMajor(input: MajorInput, accessToken: string) {
  return apiRequest<{ id: string }>("/majors", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateProgramMajor(majorId: string, input: MajorInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/majors/${majorId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteProgramMajor(majorId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/majors/${majorId}`, { method: "DELETE" }, accessToken);
}
