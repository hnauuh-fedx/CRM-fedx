import type {
  InstitutionProgramInput,
  InstitutionProgramListResponse,
} from "@/modules/institutions/institution-program-management.types";
import { apiRequest } from "./api";

export function getManagedInstitutionPrograms(
  params: {
    page: number;
    limit: number;
    search: string;
    status: string;
    institutionName: string;
    sortBy: "createdAt" | "name" | "code" | "status";
    sortOrder: "asc" | "desc";
  },
  accessToken: string,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search,
    status: params.status,
    institutionName: params.institutionName,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  return apiRequest<InstitutionProgramListResponse>(`/institution-programs?${query.toString()}`, {}, accessToken);
}

export function createManagedInstitutionProgram(input: InstitutionProgramInput, accessToken: string) {
  return apiRequest<{ id: string }>("/institution-programs", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateManagedInstitutionProgram(id: string, input: InstitutionProgramInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/institution-programs/${id}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteManagedInstitutionProgram(id: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/institution-programs/${id}`, { method: "DELETE" }, accessToken);
}
