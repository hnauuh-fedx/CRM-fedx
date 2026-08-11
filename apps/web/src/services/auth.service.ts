import { apiRequest } from "./api";
import type { AuthSession, AuthUser, LoginInput } from "@/types/auth";

export function login(input: Pick<LoginInput, "email" | "password">) {
  return apiRequest<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCurrentUser(accessToken: string) {
  return apiRequest<{ user: AuthUser }>("/auth/me", {}, accessToken);
}
