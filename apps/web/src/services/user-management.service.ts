import type {
  UserListResponse,
  UserManagementInput,
  UserManagementOptions,
  UserSortField,
} from "@/modules/management/user-management.types";
import { apiRequest } from "./api";

export function getManagedUsers(
  params: {
    page: number;
    limit: number;
    search: string;
    status: string;
    roleId: string;
    departmentId: string;
    sortBy: UserSortField;
    sortOrder: "asc" | "desc";
  },
  accessToken: string,
) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search,
    status: params.status,
    roleId: params.roleId,
    departmentId: params.departmentId,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  return apiRequest<UserListResponse>(`/users?${query.toString()}`, {}, accessToken);
}

export function getUserManagementOptions(accessToken: string) {
  return apiRequest<UserManagementOptions>("/users/options", {}, accessToken);
}

export function createManagedUser(input: UserManagementInput, accessToken: string) {
  return apiRequest<{ id: string }>("/users", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateManagedUser(userId: string, input: UserManagementInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}
