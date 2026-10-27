import type { ChangePasswordInput } from "@admission-crm/shared/password-policy";
import { apiRequest } from "./api";
import type { AuthUser } from "@/types/auth";
export { signInSession as login } from "@/modules/auth/session-client";

export function getCurrentUser(accessToken: string) {
  return apiRequest<{ user: AuthUser }>("/auth/me", {}, accessToken);
}

export function changePassword(input: ChangePasswordInput, accessToken: string) {
  return apiRequest<{ message: string }>("/auth/change-password", { method: "POST", body: JSON.stringify(input) }, accessToken);
}
