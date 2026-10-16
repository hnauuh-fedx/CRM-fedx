import type { AuthUser } from "@/types/auth";

export function canReviewMarketingFormSubmission(user: AuthUser | null) {
  if (!user || user.accessScope === "READ_ONLY") return false;
  const grantedPermissions = new Set(user.permissions);
  const hasAny = (permissions: string[]) =>
    permissions.some((key) => grantedPermissions.has(key));
  return (
    hasAny(["marketing_form.manage", "marketing_form.update_own"]) &&
    hasAny(["lead.view_all", "lead.view_department", "lead.view_assigned"]) &&
    hasAny([
      "lead.update_all",
      "lead.update_department",
      "lead.update_assigned",
    ])
  );
}
