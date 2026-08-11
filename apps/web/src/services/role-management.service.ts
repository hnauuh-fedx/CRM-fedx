import type {
  AccessScopeCode,
  RoleInput,
  RoleListResponse,
  RoleManagementOptions,
  ScopeInput,
} from "@/modules/management/role-management.types";
import { apiRequest } from "./api";

export function getManagedRoles(accessToken: string) {
  return apiRequest<RoleListResponse>("/roles", {}, accessToken);
}

export function getRoleManagementOptions(accessToken: string) {
  return apiRequest<RoleManagementOptions>("/roles/options", {}, accessToken);
}

export function createManagedRole(input: RoleInput, accessToken: string) {
  return apiRequest<{ id: string }>("/roles", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateManagedRole(roleId: string, input: RoleInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/roles/${roleId}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteManagedRole(roleId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/roles/${roleId}`, { method: "DELETE" }, accessToken);
}

export function updateManagedScope(code: AccessScopeCode, input: ScopeInput, accessToken: string) {
  return apiRequest<{ code: AccessScopeCode }>(`/roles/scopes/${code}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}
