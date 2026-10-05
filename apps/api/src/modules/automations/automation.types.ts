export type AutomationRuleListItem = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  triggerType: string;
  version: number;
  institutionProgramId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: { id: string; fullName: string } | null;
  institutionProgram: { id: string; name: string } | null;
  executionCount?: number;
};

export type AutomationRuleDetail = AutomationRuleListItem & {
  graphData: AutomationGraphData;
};

export type AutomationGraphData = {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
};

export type AutomationNode = {
  id: string;
  type: AutomationNodeType;
  position: { x: number; y: number };
  data: AutomationNodeData;
  selected?: boolean;
};

export type AutomationEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};

export type AutomationNodeType =
  | "trigger"
  | "condition"
  | "action_notification"
  | "action_assign"
  | "action_assign_pool"
  | "action_update_stage"
  | "action_activity"
  | "action_reminder"
  | "delay";

export type AutomationNodeData = {
  label: string;
  // Trigger
  triggerType?: string;
  // Condition
  field?: string;
  operator?: string;
  value?: string;
  conditionCombinator?: "AND" | "OR";
  conditions?: AutomationCondition[];
  // Action: notification
  title?: string;
  content?: string;
  targetRole?: string;
  // Action: assign
  assignToUserId?: string;
  assignmentStrategy?: "round_robin" | "least_loaded";
  assigneeIds?: string[];
  departmentId?: string;
  // Action: update stage
  stageId?: string;
  // Action: activity
  activityType?: string;
  activityContent?: string;
  // Action: reminder
  reminderTitle?: string;
  reminderContent?: string;
  reminderDelayMinutes?: number;
  // Trigger: SLA
  slaMinutes?: number;
  // Delay
  delayMinutes?: number;
};
export type AutomationCondition = {
  id?: string;
  field: string;
  operator: string;
  value?: string;
};

export type AutomationRuleListResponse = {
  data: AutomationRuleListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    search: string;
    isActive: boolean | null;
    triggerType: string;
    institutionProgramId: string;
  };
};

export type AutomationOptions = {
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
  triggerTypes: string[];
  assignees: Array<{ id: string; fullName: string }>;
  pipelineStages: Array<{ id: string; name: string; pipelineName: string | null }>;
  targetRoles: Array<{ id: string; code: string; name: string }>;
  systemFieldOptions: Record<string, Array<{ code: string; label: string }>>;
};
