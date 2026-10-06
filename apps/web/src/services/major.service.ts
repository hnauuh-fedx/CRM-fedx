import type {
  MajorInput,
  MajorListResponse,
  MajorSortField,
} from "@/modules/admissions/major-management.types";
import { apiRequest } from "./api";
import { saveRuntimeCustomFields } from "./custom-field.service";

export function getProgramMajors(
  params: { page: number; limit: number; search: string; sortBy: MajorSortField; sortOrder: "asc" | "desc" },
  accessToken: string,
  institutionProgramId: string,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  return apiRequest<MajorListResponse>(`/majors?${query.toString()}`, { headers: { "X-Institution-Program-Id": institutionProgramId } }, accessToken);
}

export async function createProgramMajor(input: MajorInput, accessToken: string, institutionProgramId: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>("/majors", { method: "POST", body: JSON.stringify(payload), headers: { "X-Institution-Program-Id": institutionProgramId } }, accessToken);
  if (customFieldValues && Object.keys(customFieldValues).length > 0) await saveRuntimeCustomFields("ADMISSION_MAJOR", result.id, customFieldValues, accessToken, institutionProgramId);
  return result;
}

export async function updateProgramMajor(majorId: string, input: MajorInput, accessToken: string, institutionProgramId: string) {
  const { customFieldValues, ...payload } = input;
  const result = await apiRequest<{ id: string }>(`/majors/${majorId}`, { method: "PATCH", body: JSON.stringify(payload), headers: { "X-Institution-Program-Id": institutionProgramId } }, accessToken);
  if (customFieldValues) await saveRuntimeCustomFields("ADMISSION_MAJOR", majorId, customFieldValues, accessToken, institutionProgramId);
  return result;
}

export function deleteProgramMajor(majorId: string, accessToken: string, institutionProgramId: string) {
  return apiRequest<{ id: string }>(`/majors/${majorId}`, { method: "DELETE", headers: { "X-Institution-Program-Id": institutionProgramId } }, accessToken);
}
