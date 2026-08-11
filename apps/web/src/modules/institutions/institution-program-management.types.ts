export type InstitutionOption = { id: string; name: string; code: string; status: string | null };
export type ProgramTypeOption = { id: string; name: string; code: string };

export type ManagedInstitutionProgram = {
  id: string;
  name: string;
  code: string;
  status: "active" | "inactive" | "archived";
  institution: InstitutionOption;
  programType: ProgramTypeOption;
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
  institutionId: string;
  programTypeId: string;
  name: string;
  code: string;
  status: "active" | "inactive" | "archived";
};

export type InstitutionProgramListResponse = {
  data: ManagedInstitutionProgram[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  filters: { search: string; status: string; institutionId: string; programTypeId: string };
  sort: { sortBy: "createdAt" | "name" | "code" | "status"; sortOrder: "asc" | "desc" };
};

export type InstitutionProgramManagementOptions = {
  institutions: InstitutionOption[];
  programTypes: ProgramTypeOption[];
  statuses: Array<"active" | "inactive" | "archived">;
};
