export type AutomationAssignmentStrategy = "least_loaded" | "round_robin" | "weighted";

export type AutomationAssigneeWeight = {
  assigneeId: string;
  weight: number;
};
