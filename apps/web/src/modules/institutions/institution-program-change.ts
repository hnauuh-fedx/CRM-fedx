export type InstitutionProgramChangeGuard = (programId: string) => boolean;

/** All guards run before storage, selected state or scoped caches can change. */
export function attemptInstitutionProgramChange(
  programId: string,
  selectedProgramId: string | null,
  availableProgramIds: readonly string[],
  guards: Iterable<InstitutionProgramChangeGuard>,
  commit: (programId: string) => void,
): boolean {
  if (programId === selectedProgramId || !availableProgramIds.includes(programId)) return false;
  for (const guard of guards) if (!guard(programId)) return false;
  commit(programId);
  return true;
}
