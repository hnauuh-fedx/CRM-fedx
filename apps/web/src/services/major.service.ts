import type {
  MajorInput,
  MajorListResponse,
  MajorManagementOptions,
  MajorSortField,
} from "@/modules/admissions/major-management.types";
import { apiRequest } from "./api";
import { saveRuntimeCustomFields } from "./custom-field.service";

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

export async function createProgramMajor(input: MajorInput, accessToken: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>("/majors", { method: "POST", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues && Object.keys(customFieldValues).length > 0) await saveRuntimeCustomFields("ADMISSION_MAJOR", result.id, customFieldValues, accessToken);
  return result;
}

export async function updateProgramMajor(majorId: string, input: MajorInput, accessToken: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>(`/majors/${majorId}`, { method: "PATCH", body: JSON.stringify(payload) }, accessToken);
  if (customFieldValues) await saveRuntimeCustomFields("ADMISSION_MAJOR", majorId, customFieldValues, accessToken);
  return result;
}

export function deleteProgramMajor(majorId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/majors/${majorId}`, { method: "DELETE" }, accessToken);
}
