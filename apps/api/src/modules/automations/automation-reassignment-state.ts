type ReassignmentCandidatePlanInput = {
  eligibleIds: string[];
  currentAssigneeId: string;
  attemptedAssigneeIds: string[];
  recyclePool: boolean;
  poolCycle: number;
  maxPoolCycles: number;
};

export type ReassignmentStopReason = "candidate_pool_exhausted" | "pool_cycle_limit_reached";

export function planReassignmentCandidates(input: ReassignmentCandidatePlanInput) {
  const eligibleIds = [...new Set(input.eligibleIds)];
  const attemptedAssigneeIds = [...new Set(input.attemptedAssigneeIds)];
  const attempted = new Set(attemptedAssigneeIds);
  const untried = eligibleIds.filter((id) => id !== input.currentAssigneeId && !attempted.has(id));

  if (untried.length > 0) {
    return {
      candidateIds: untried,
      attemptedAssigneeIds,
      poolCycle: input.poolCycle,
      recycled: false,
    } as const;
  }
  if (!input.recyclePool) return { stopReason: "candidate_pool_exhausted" as const };
  if (input.poolCycle >= input.maxPoolCycles) return { stopReason: "pool_cycle_limit_reached" as const };

  const recycledCandidates = eligibleIds.filter((id) => id !== input.currentAssigneeId);
  if (recycledCandidates.length === 0) return { stopReason: "candidate_pool_exhausted" as const };
  return {
    candidateIds: recycledCandidates,
    attemptedAssigneeIds: [input.currentAssigneeId],
    poolCycle: input.poolCycle + 1,
    recycled: true,
  } as const;
}

export function buildReassignmentSchedule(
  assignedAt: Date,
  policy: { timeoutMinutes: number; warningEnabled: boolean; warningBeforeMinutes: number },
) {
  const reassignmentDueAt = new Date(assignedAt.getTime() + policy.timeoutMinutes * 60_000);
  return {
    warningDueAt: policy.warningEnabled
      ? new Date(reassignmentDueAt.getTime() - policy.warningBeforeMinutes * 60_000)
      : null,
    reassignmentDueAt,
  };
}
