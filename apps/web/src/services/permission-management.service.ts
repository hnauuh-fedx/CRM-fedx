import type {
  PermissionInput,
  PermissionListResponse,
  PermissionManagementOptions,
  PermissionSortField,
} from "@/modules/management/permission-management.types";
import { apiRequest } from "./api";

export function getManagedPermissions(
  params: {
    page: number;
    limit: number;
    search: string;
    module: string;
    status: string;
    sortBy: PermissionSortField;
    sortOrder: "asc" | "desc";
  },
  accessToken: string,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search,
    module: params.module,
    status: params.status,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  return apiRequest<PermissionListResponse>(`/permissions?${query.toString()}`, {}, accessToken);
}

export function getPermissionManagementOptions(accessToken: string) {
  return apiRequest<PermissionManagementOptions>("/permissions/options", {}, accessToken);
}

export function createManagedPermission(input: PermissionInput, accessToken: string) {
  return apiRequest<{ id: string }>("/permissions", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateManagedPermission(permissionId: string, input: PermissionInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/permissions/${permissionId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteManagedPermission(permissionId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/permissions/${permissionId}`, { method: "DELETE" }, accessToken);
}
