export type AutomationAssignmentStrategy = "least_loaded" | "round_robin" | "weighted";

export type AutomationAssigneeWeight = {
  assigneeId: string;
  weight: number;
};

export type AutomationAssignmentResult = {
  kind: "assigned" | "conflict" | "unchanged" | "stale_event";
  reason: string;
  currentAssigneeId: string | null;
  currentAssigneeName?: string;
  requestedAssigneeName?: string;
  sourceRestricted?: boolean;
  requestedAssigneeId: string | null;
  candidateIds: string[];
  departmentId: string | null;
  assignmentId: string | null;
  source: { ruleId: string; ruleName: string; version: number | null; nodeId: string; executionId: string; canOpenRule?: boolean } | null;
};
