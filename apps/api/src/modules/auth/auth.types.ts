export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roles: string[];
  permissions: string[];
  departmentIds: string[];
  institutionProgramIds: string[];
  workingInstitutionProgramId?: string | null;
  accessScope: "ALL" | "DEPARTMENT" | "ASSIGNED_ONLY" | "OWNED_ONLY" | "READ_ONLY";
};

export type AccessTokenPayload = {
  sub: string;
  type: "access";
};
