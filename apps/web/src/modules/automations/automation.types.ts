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

export type AutomationConfigField = {
  key: keyof AutomationNodeData;
  label: string;
  control: "condition_group" | "multi_select" | "number" | "select" | "template_text" | "template_textarea" | "text";
  required: boolean;
  optionsSource?: "assignees" | "departments" | "pipelineStages" | "targetRoles";
  options?: Array<{ code: string; label: string }>;
  min?: number;
  visibleForTriggerTypes?: string[];
};

export type AutomationNodeDefinition = {
  type: AutomationNodeType;
  category: "trigger" | "condition" | "action" | "delay";
  label: string;
  description: string;
  icon: "bell" | "clock" | "git-branch" | "notebook" | "refresh" | "user-plus" | "users" | "zap";
  tone: "blue" | "green" | "indigo" | "orange" | "purple" | "teal" | "yellow";
  defaultData?: Partial<AutomationNodeData>;
  requiredCapabilities?: Array<"assign" | "createReminder" | "updateLead" | "writeActivity">;
  configFields: AutomationConfigField[];
};

export type AutomationRegistry = {
  version: number;
  triggers: Array<{ code: string; label: string }>;
  nodes: AutomationNodeDefinition[];
  fields: AutomationRegistryField[];
  operators: Array<{ code: string; label: string; requiresValue: boolean; dataTypes: string[] }>;
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
  registry: AutomationRegistry;
  institutionPrograms: Array<{ id: string; name: string; institutionName: string }>;
  triggerTypes: string[];
  assignees: Array<{ id: string; fullName: string }>;
  departments: Array<{ id: string; name: string }>;
  pipelineStages: Array<{ id: string; name: string; pipelineName: string | null }>;
  targetRoles: Array<{ id: string; code: string; name: string }>;
  customDataFields: AutomationCustomDataField[];
  customerLists: Array<{ id: string; name: string }>;
  systemFieldOptions: Record<string, AutomationDataFieldOption[]>;
};

export type AutomationBulkPreview = {
  total: number;
  sample: Array<{ id: string; leadCode: string | null; fullName: string }>;
  actions: Array<{ nodeId: string; type: string; label: string }>;
};

export type AutomationBulkJob = {
  id: string;
  status: string;
  totalCount: number;
  processedCount: number;
  failedCount: number;
  errorMessage: string | null;
  createdAt: string | null;
  completedAt: string | null;
};

export type AutomationDataFieldOption = {
  code: string;
  label: string;
};

export type AutomationDataField = {
  reference: string;
  key: string;
  label: string;
  description: string | null;
  dataType: string;
  groupKey: string;
  groupLabel: string;
  source: "system" | "custom";
  isSensitive: boolean;
  options: AutomationDataFieldOption[];
};

export type AutomationRegistryField = Omit<AutomationDataField, "options"> & {
  optionSource?: string;
};

export type AutomationCustomDataField = {
  reference: string;
  id: string;
  key: string;
  label: string;
  description: string | null;
  dataType: string;
  group: { id: string; key: string; label: string };
  isSensitive: boolean;
  options: unknown;
};

export type AutomationTestLead = {
  id: string;
  leadCode: string | null;
  fullName: string;
  phone: string | null;
  institutionProgramId: string | null;
};

export type AutomationTestLeadResponse = {
  data: AutomationTestLead[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type AutomationTestRunResponse = {
  executionId: string;
  status: string;
  version: number;
};

export type AutomationExecutionDetail = {
  id: string;
  source: string;
  status: string;
  version: number | null;
  executionActorId: string | null;
  contextData: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  nodes: Array<{
    id: string;
    nodeId: string;
    nodeType: string;
    status: string;
    attemptCount: number;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
};
