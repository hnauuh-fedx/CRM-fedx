export type PersistedNodeExecutionState = {
  status: string;
  nextSourceHandle: string | null;
  delayMinutes: number;
};

export type NodeExecutionDecision =
  | { kind: "execute_action" }
  | { kind: "reuse_action_result"; nextSourceHandle: string | null; delayMinutes: number }
  | { kind: "already_completed" };

export function decideNodeExecution(state: PersistedNodeExecutionState | null): NodeExecutionDecision {
  if (state?.status === "completed") return { kind: "already_completed" };
  if (state?.status === "action_completed") {
    return {
      kind: "reuse_action_result",
      nextSourceHandle: state.nextSourceHandle,
      delayMinutes: state.delayMinutes,
    };
  }
  return { kind: "execute_action" };
}
