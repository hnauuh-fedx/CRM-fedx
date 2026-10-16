import type { AuthUser } from "../auth/auth.types";
import type { Prisma } from "../../generated/prisma/client";

export type MarketingFormViewer = Pick<AuthUser, "id" | "permissions" | "departmentIds" | "accessScope">
  & Partial<Pick<AuthUser, "institutionProgramIds">>;

// Routers narrow institutionProgramIds to the authenticated working program.
// Direct service callers must supply a program too; absence never means ALL.
export function getMarketingFormVisibility(user: MarketingFormViewer, programId?: string): Prisma.marketing_formsWhereInput[] {
  const programIds = user.institutionProgramIds ?? [];
  const program = programId ?? programIds[0];
  const scope: Prisma.marketing_formsWhereInput[] = [
    { institution_program_id: program && programIds.includes(program) ? program : "00000000-0000-4000-8000-000000000000" },
  ];
  if (user.accessScope === "ALL" && user.permissions.includes("campaign.view_all")) return scope;
  if (user.accessScope === "DEPARTMENT" && user.departmentIds.length > 0) {
    scope.push({ users: { is: { user_departments: { some: { department_id: { in: user.departmentIds } } } } } });
  } else {
    scope.push({ created_by: user.id });
  }
  return scope;
}
