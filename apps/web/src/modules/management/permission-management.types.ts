export type ManagedPermission = {
  id: string;
  code: string;
  name: string;
  module: string | null;
  description: string | null;
  isActive: boolean;
  roleCount: number;
  createdAt: string | null;
};

export type PermissionInput = {
  code: string;
  name: string;
  module: string;
  description: string;
  isActive: boolean;
};

export type PermissionSortField = "createdAt" | "code" | "name" | "module";

export type PermissionListResponse = {
  data: ManagedPermission[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  sort: { sortBy: PermissionSortField; sortOrder: "asc" | "desc" };
  filters: { search: string; module: string; status: string };
};

export type PermissionManagementOptions = {
  modules: string[];
  statuses: Array<"active" | "inactive">;
};
