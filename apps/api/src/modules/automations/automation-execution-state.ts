export type PersistedNodeExecutionState = {
  status: string;
  nextSourceHandle: string | null;
  delayMinutes: number;
};

export type NodeExecutionDecision =
  | { kind: "execute_action" }
  | { kind: "reuse_action_result"; nextSourceHandle: string | null; delayMinutes: number; noChange?: boolean }
  | { kind: "already_completed" };

export function decideNodeExecution(state: PersistedNodeExecutionState | null): NodeExecutionDecision {
  if (state?.status === "completed" || state?.status === "completed_no_change") return { kind: "already_completed" };
  if (state?.status === "action_completed" || state?.status === "action_completed_no_change") {
    return {
      kind: "reuse_action_result",
      nextSourceHandle: state.nextSourceHandle,
      delayMinutes: state.delayMinutes,
      ...(state.status === "action_completed_no_change" ? { noChange: true } : {}),
    };
  }
  return { kind: "execute_action" };
}
