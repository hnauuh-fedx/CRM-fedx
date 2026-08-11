export type AccessScopeCode = "ALL" | "DEPARTMENT" | "ASSIGNED_ONLY" | "OWNED_ONLY" | "READ_ONLY";

export type ManagedPermission = {
  id: string;
  code: string;
  name: string;
  module: string | null;
};

export type ManagedRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scopeCode: AccessScopeCode;
  userCount: number;
  permissions: ManagedPermission[];
  createdAt: string | null;
};

export type ManagedAccessScope = {
  code: AccessScopeCode;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type RoleListResponse = {
  data: ManagedRole[];
};

export type RoleManagementOptions = {
  permissions: ManagedPermission[];
  scopes: ManagedAccessScope[];
};

export type RoleInput = {
  name: string;
  code: string;
  description: string;
  scopeCode: AccessScopeCode;
  permissionIds: string[];
};

export type ScopeInput = {
  name: string;
  description: string;
  isActive: boolean;
};
