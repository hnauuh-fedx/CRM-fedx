export type DepartmentUserOption = {
  id: string;
  fullName: string;
  email: string;
};

export type ManagedDepartment = {
  id: string;
  name: string;
  code: string | null;
  manager: DepartmentUserOption | null;
  members: DepartmentUserOption[];
  memberCount: number;
  leadAssignmentCount: number;
  createdAt: string | null;
};

export type DepartmentInput = {
  name: string;
  code: string;
  managerId: string;
  memberIds: string[];
};

export type DepartmentSortField = "createdAt" | "code" | "name";

export type DepartmentListResponse = {
  data: ManagedDepartment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  sort: { sortBy: DepartmentSortField; sortOrder: "asc" | "desc" };
  filters: { search: string };
};

export type DepartmentManagementOptions = {
  users: DepartmentUserOption[];
};
