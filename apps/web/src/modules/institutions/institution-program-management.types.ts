export type ManagedInstitutionProgram = {
  id: string;
  name: string;
  code: string;
  status: "active" | "inactive" | "archived";
  institutionName: string;
  counts: {
    leads: number;
    admissions: number;
    students: number;
    campaigns: number;
    majors: number;
    leadSources: number;
    kpiTargets: number;
    reportConfigs: number;
    total: number;
  };
  createdAt: string | null;
  updatedAt: string | null;
};

export type InstitutionProgramInput = {
  institutionName: string;
  name: string;
  code: string;
  status: "active" | "inactive" | "archived";
};

export type InstitutionProgramListResponse = {
  data: ManagedInstitutionProgram[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  filters: { search: string; status: string; institutionName: string };
  sort: { sortBy: "createdAt" | "name" | "code" | "status"; sortOrder: "asc" | "desc" };
};
