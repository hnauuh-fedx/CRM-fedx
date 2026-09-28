import type { AuthUser } from "../../auth/auth.types";

export const leadUpdatePermissions = [
  "lead.update_all",
  "lead.update_department",
  "lead.update_assigned",
] as const;

export function canCreateLead(actor: AuthUser) {
  return actor.permissions.includes("lead.create");
}

export function canAssignLead(actor: AuthUser) {
  return (
    actor.permissions.includes("lead.assign") ||
    actor.permissions.includes("lead.reassign")
  );
}

export function canUpdateLead(actor: AuthUser) {
  return leadUpdatePermissions.some((permission) =>
    actor.permissions.includes(permission),
  );
}

export function isAssigneeInScope(
  actor: AuthUser,
  memberships: Array<{ department_id: string | null }>,
) {
  if (
    actor.accessScope === "ALL" &&
    actor.permissions.includes("lead.view_all")
  ) {
    return true;
  }
  return memberships.some(
    (membership) =>
      membership.department_id &&
      actor.departmentIds.includes(membership.department_id),
  );
}

export function canUseAssignmentDepartment(
  actor: AuthUser,
  departmentId: string,
) {
  return (
    (actor.accessScope === "ALL" &&
      actor.permissions.includes("lead.view_all")) ||
    actor.departmentIds.includes(departmentId)
  );
}
