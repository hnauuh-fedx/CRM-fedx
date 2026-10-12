export type AssigneeLoad = { id: string; activeLeadCount: number };
export type WeightedAssigneeLoad = AssigneeLoad & { weight: number };

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

export function selectWeightedAssignee(candidates: WeightedAssigneeLoad[]) {
  requireCandidates(candidates);
  if (candidates.some((candidate) => !Number.isInteger(candidate.weight) || candidate.weight < 1)) {
    throw new Error("Trọng số phân công phải là số nguyên lớn hơn 0.");
  }
  return candidates.reduce((selected, candidate) => {
    const selectedScore = (selected.activeLeadCount + 1) / selected.weight;
    const candidateScore = (candidate.activeLeadCount + 1) / candidate.weight;
    return candidateScore < selectedScore ? candidate : selected;
  }).id;
}

function requireCandidates(candidates: unknown[]) {
  if (candidates.length === 0) throw new Error("Chiến lược phân công cần ít nhất một nhân viên.");
}
