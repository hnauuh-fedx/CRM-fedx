export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roles: string[];
  permissions: string[];
  departmentIds: string[];
  institutionProgramIds: string[];
  accessScope: "ALL" | "DEPARTMENT" | "ASSIGNED_ONLY" | "OWNED_ONLY" | "READ_ONLY";
};

export type AccessTokenPayload = {
  sub: string;
  type: "access";
};
