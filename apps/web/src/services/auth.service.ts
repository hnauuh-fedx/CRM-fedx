import { apiRequest } from "./api";
import type { AuthSession, AuthUser, LoginInput } from "@/types/auth";
import { readSelectedInstitutionProgramId } from "@/modules/institutions/institution-program-storage";

export function login(input: Pick<LoginInput, "email" | "password">) {
  const selectedProgramId = readSelectedInstitutionProgramId();
  return apiRequest<AuthSession>("/auth/login", {
    method: "POST",
    headers: selectedProgramId ? { "X-Institution-Program-Id": selectedProgramId } : undefined,
    body: JSON.stringify(input),
  });
}

export function getCurrentUser(accessToken: string) {
  return apiRequest<{ user: AuthUser }>("/auth/me", {}, accessToken);
}
