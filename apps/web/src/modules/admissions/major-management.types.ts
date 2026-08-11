export type MajorSortField = "createdAt" | "name" | "code";

export type ManagedMajor = {
  id: string;
  name: string;
  code: string | null;
  facultyId: string | null;
  facultyName: string | null;
  leadCount: number;
  admissionCount: number;
  studentCount: number;
  createdAt: string | null;
};

export type MajorListResponse = {
  data: ManagedMajor[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  sort: { sortBy: MajorSortField; sortOrder: "asc" | "desc" };
  filters: { search: string };
};

export type MajorManagementOptions = {
  faculties: Array<{ id: string; name: string }>;
};

export type MajorInput = {
  name: string;
  code: string;
  facultyId: string;
};
