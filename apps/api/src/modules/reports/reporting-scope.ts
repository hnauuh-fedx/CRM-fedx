import type { AuthUser } from "../auth/auth.types";

export function resolveReportingScopeKeys(user: AuthUser) {
  const permissions = new Set(user.permissions);
  if (user.accessScope === "ALL" && permissions.has("report.view_all")) return ["ALL"];
  if (user.accessScope === "OWNED_ONLY") return [`OWNED:${user.id}`];
  if (user.accessScope === "DEPARTMENT") return user.departmentIds.map((id) => `DEPARTMENT:${id}`);
  return [`ASSIGNED:${user.id}`];
}
