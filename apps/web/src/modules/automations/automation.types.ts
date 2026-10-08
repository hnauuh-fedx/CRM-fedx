import type { AutomationReassignmentPolicy } from "@admission-crm/shared/automation-reassignment-policy";

export type { AutomationReassignmentPolicy } from "@admission-crm/shared/automation-reassignment-policy";

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
  | "action_message"
  | "action_webhook"
  | "action_create_admission"
  | "action_request_document"
  | "action_update_admission_status"
  | "action_convert_student"
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
  reassignmentPolicy?: AutomationReassignmentPolicy;
  // Action: update stage
  stageId?: string;
  // Action: activity
  activityType?: string;
  activityContent?: string;
  // Action: reminder
  reminderTitle?: string;
  reminderContent?: string;
  reminderDelayMinutes?: number;
  // Action: outbound message
  messageChannel?: "email" | "sms" | "zns";
  messageSubject?: string;
  messageContent?: string;
  consentPolicy?: "require_consent" | "allow_unknown";
  // Action: signed webhook
  webhookEndpointId?: string;
  webhookPayload?: string;
  // Action: admission
  admissionMajorId?: string;
  admissionStatusId?: string;
  admissionDocumentType?: string;
  admissionClassId?: string;
  // Trigger: SLA
  slaMinutes?: number;
  // Trigger: schedule
  scheduleTimezone?: string;
  scheduleTime?: string;
  scheduleDays?: string[];
  scheduleExcludedDates?: string;
  scheduleCustomerListId?: string;
  expiryLeadDays?: number;
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
  optionsSource?: "admissionClasses" | "admissionStatuses" | "assignees" | "customerLists" | "departments" | "majors" | "pipelineStages" | "targetRoles" | "webhookEndpoints";
  options?: Array<{ code: string; label: string }>;
  min?: number;
  visibleForTriggerTypes?: string[];
};

export type AutomationNodeDefinition = {
  type: AutomationNodeType;
  category: "trigger" | "condition" | "action" | "delay";
  label: string;
  description: string;
  icon: "bell" | "clock" | "file-plus" | "git-branch" | "graduation-cap" | "mail" | "notebook" | "refresh" | "user-plus" | "users" | "webhook" | "zap";
  tone: "blue" | "green" | "indigo" | "orange" | "purple" | "teal" | "yellow";
  defaultData?: Partial<AutomationNodeData>;
  requiredCapabilities?: Array<"assign" | "callWebhook" | "convertStudent" | "createAdmission" | "createReminder" | "requestAdmissionDocument" | "sendMessage" | "updateAdmissionStatus" | "updateLead" | "writeActivity">;
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
  webhookEndpoints: Array<{ id: string; name: string }>;
  majors: Array<{ id: string; name: string }>;
  admissionStatuses: Array<{ id: string; name: string; code: string | null }>;
  admissionClasses: Array<{ id: string; name: string; code: string | null }>;
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

export type AutomationExecutionStatus = "queued" | "processing" | "completed" | "failed" | "stuck";

export type AutomationOperationsExecution = {
  id: string;
  rule: { id: string; name: string };
  version: number | null;
  source: string;
  status: AutomationExecutionStatus;
  nodeExecutionCount: number;
  contextData: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type AutomationOperationsExecutionDetail = Omit<AutomationOperationsExecution, "nodeExecutionCount"> & {
  nodes: Array<{
    id: string;
    nodeId: string;
    nodeType: string;
    status: string;
    attemptCount: number;
    errorMessage: string | null;
    startedAt: string | null;
    actionCompletedAt: string | null;
    completedAt: string | null;
  }>;
};

export type AutomationExecutionListResponse = {
  data: AutomationOperationsExecution[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type AutomationOperationalMetrics = {
  range: { from: string; to: string };
  totals: {
    executions: number;
    completed: number;
    failed: number;
    processing: number;
    stuck: number;
    affectedEntities: number;
    successRate: number;
    failureRate: number;
    averageLatencyMs: number | null;
    throughputPerHour: number;
  };
  queue: {
    available: boolean;
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    paused: number;
  };
  perRule: Array<{
    ruleId: string;
    ruleName: string;
    total: number;
    completed: number;
    failed: number;
    successRate: number;
    affectedLeads: number;
    affectedAdmissions: number;
    affectedStudents: number;
  }>;
};

export type AutomationRuleVersion = {
  id: string;
  version: number;
  triggerType: string;
  createdAt: string | null;
  createdBy: { id: string; fullName: string } | null;
  isCurrent: boolean;
  changes: {
    addedNodeIds: string[];
    removedNodeIds: string[];
    changedNodeIds: string[];
    addedEdgeIds: string[];
    removedEdgeIds: string[];
  } | null;
};
