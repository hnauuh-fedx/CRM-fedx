export type AccessScopeCode = "ALL" | "DEPARTMENT" | "ASSIGNED_ONLY" | "OWNED_ONLY" | "READ_ONLY";

export type ManagedPermission = {
  id: string;
  code: string;
  name: string;
  module: string | null;
};

export type ManagedProgram = {
  id: string;
  code: string;
  name: string;
  institutionName: string;
};

export type ManagedRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scopeCode: AccessScopeCode;
  userCount: number;
  permissions: ManagedPermission[];
  programs: ManagedProgram[];
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
  programs: ManagedProgram[];
};

export type RoleInput = {
  name: string;
  code: string;
  description: string;
  scopeCode: AccessScopeCode;
  permissionIds: string[];
  programIds: string[];
};

export type ScopeInput = {
  name: string;
  description: string;
  isActive: boolean;
};
