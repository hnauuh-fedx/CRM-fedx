import { apiRequest } from "./api";
import type { AuthUser } from "@/types/auth";
export { signInSession as login } from "@/modules/auth/session-client";

export function getCurrentUser(accessToken: string) {
  return apiRequest<{ user: AuthUser }>("/auth/me", {}, accessToken);
}
