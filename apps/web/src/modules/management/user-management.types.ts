export type AccessScope = "ALL" | "DEPARTMENT" | "ASSIGNED_ONLY" | "OWNED_ONLY" | "READ_ONLY";

export type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: "active" | "inactive" | "suspended";
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  accessScope: AccessScope;
  roles: Array<{ id: string; code: string; name: string }>;
  departments: Array<{ id: string; code: string | null; name: string }>;
};

export type UserSortField = "createdAt" | "fullName" | "email" | "lastLoginAt";

export type UserListResponse = {
  data: ManagedUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  sort: { sortBy: UserSortField; sortOrder: "asc" | "desc" };
  filters: {
    search: string;
    status: string;
    roleId: string;
    departmentId: string;
  };
};

export type UserManagementOptions = {
  roles: Array<{ id: string; code: string; name: string; description: string | null }>;
  departments: Array<{ id: string; code: string | null; name: string }>;
  scopes: AccessScope[];
};

export type UserManagementInput = {
  fullName: string;
  email: string;
  phone: string;
  status: "active" | "inactive" | "suspended";
  password: string;
  roleIds: string[];
  departmentIds: string[];
  accessScope: AccessScope;
};
