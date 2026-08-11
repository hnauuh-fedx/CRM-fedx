import type {
  DepartmentInput,
  DepartmentListResponse,
  DepartmentManagementOptions,
  DepartmentSortField,
} from "@/modules/management/department-management.types";
import { apiRequest } from "./api";

export function getManagedDepartments(
  params: {
    page: number;
    limit: number;
    search: string;
    sortBy: DepartmentSortField;
    sortOrder: "asc" | "desc";
  },
  accessToken: string,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  return apiRequest<DepartmentListResponse>(`/departments?${query.toString()}`, {}, accessToken);
}

export function getDepartmentManagementOptions(accessToken: string) {
  return apiRequest<DepartmentManagementOptions>("/departments/options", {}, accessToken);
}

export function createManagedDepartment(input: DepartmentInput, accessToken: string) {
  return apiRequest<{ id: string }>("/departments", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateManagedDepartment(departmentId: string, input: DepartmentInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/departments/${departmentId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteManagedDepartment(departmentId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/departments/${departmentId}`, { method: "DELETE" }, accessToken);
}
