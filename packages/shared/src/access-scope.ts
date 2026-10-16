export type AccessScope = "ALL" | "DEPARTMENT" | "ASSIGNED_ONLY" | "OWNED_ONLY" | "READ_ONLY";

const scopesWithinRole: Record<AccessScope, readonly AccessScope[]> = {
  ALL: ["ALL", "DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"],
  DEPARTMENT: ["DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"],
  ASSIGNED_ONLY: ["ASSIGNED_ONLY", "READ_ONLY"],
  OWNED_ONLY: ["OWNED_ONLY", "READ_ONLY"],
  READ_ONLY: ["READ_ONLY"],
};

export function isAccessScopeWithinRole(scope: AccessScope, roleScope: AccessScope) {
  return scopesWithinRole[roleScope].includes(scope);
}

export function resolveEffectiveAccessScope(roleScope: AccessScope, override?: AccessScope | null): AccessScope {
  return override && isAccessScopeWithinRole(override, roleScope) ? override : roleScope;
}

// Compatibility defaults for roles without a configured scope. Business queries
// still enforce explicit permissions; role codes do not authorize actions.
export function defaultRoleAccessScope(roleCodes: readonly string[]): AccessScope {
  if (roleCodes.includes("DIRECTOR")) return "ALL";
  if (roleCodes.includes("TELESALE")) return "ASSIGNED_ONLY";
  if (roleCodes.includes("MARKETING_STAFF")) return "OWNED_ONLY";
  if (roleCodes.includes("VIEWER")) return "READ_ONLY";
  return "DEPARTMENT";
}
