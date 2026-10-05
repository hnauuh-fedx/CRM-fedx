export type AssigneeLoad = { id: string; activeLeadCount: number };

export function selectRoundRobinAssignee(candidateIds: string[], lastAssigneeId: string | null) {
  requireCandidates(candidateIds);
  const lastIndex = lastAssigneeId ? candidateIds.indexOf(lastAssigneeId) : -1;
  return candidateIds[(lastIndex + 1) % candidateIds.length];
}

export function selectLeastLoadedAssignee(candidates: AssigneeLoad[]) {
  requireCandidates(candidates);
  return candidates.reduce((selected, candidate) =>
    candidate.activeLeadCount < selected.activeLeadCount ? candidate : selected).id;
}

function requireCandidates(candidates: unknown[]) {
  if (candidates.length === 0) throw new Error("Chiến lược phân công cần ít nhất một nhân viên.");
}
