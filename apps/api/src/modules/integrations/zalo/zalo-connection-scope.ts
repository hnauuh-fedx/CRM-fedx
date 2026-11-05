import type { AuthUser } from "../../auth/auth.types";

const noProgramId = "00000000-0000-0000-0000-000000000000";

/** The working program the request header selected; connections never cross programs, even for ALL scope. */
export function workingProgramId(user: AuthUser) {
  const programId = user.workingInstitutionProgramId;
  return programId && user.institutionProgramIds.includes(programId) ? programId : null;
}

export function zaloConnectionScope(user: AuthUser, appId?: string) {
  const configuredAppId = appId?.trim();
  return {
    ...(configuredAppId ? { app_id: configuredAppId } : {}),
    institution_program_id: workingProgramId(user) ?? noProgramId,
  };
}
