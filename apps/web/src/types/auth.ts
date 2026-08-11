export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roles: string[];
  permissions: string[];
  departmentIds: string[];
  accessScope: "ALL" | "DEPARTMENT" | "ASSIGNED_ONLY" | "OWNED_ONLY" | "READ_ONLY";
};

export type LoginInput = {
  email: string;
  password: string;
  rememberDevice: boolean;
};

export type AuthSession = {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
};
