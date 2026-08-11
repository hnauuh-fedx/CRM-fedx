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
  | "action_update_stage"
  | "action_activity"
  | "delay";

export type AutomationNodeData = {
  label: string;
  // Trigger
  triggerType?: string;
  // Condition
  field?: string;
  operator?: string;
  value?: string;
  // Action: notification
  title?: string;
  content?: string;
  targetRole?: string;
  // Action: assign
  assignToUserId?: string;
  // Action: update stage
  stageId?: string;
  // Action: activity
  activityType?: string;
  activityContent?: string;
  // Delay
  delayMinutes?: number;
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
};

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  lead_created: "Lead được tạo mới",
  lead_status_changed: "Lead đổi giai đoạn pipeline",
  lead_assigned: "Lead được phân công",
  lead_unassigned: "Lead bị thu hồi phân công",
  reminder_overdue: "Nhắc việc quá hạn",
  schedule_daily: "Tự động hàng ngày",
};

export const NODE_TYPE_DEFINITIONS: Array<{
  type: AutomationNodeType;
  label: string;
  description: string;
  colorClass: string;
  category: "trigger" | "condition" | "action" | "delay";
}> = [
  {
    type: "trigger",
    label: "Khởi động",
    description: "Điểm bắt đầu của quy trình",
    colorClass: "bg-blue-500",
    category: "trigger",
  },
  {
    type: "condition",
    label: "Điều kiện",
    description: "Kiểm tra và phân nhánh theo dữ liệu",
    colorClass: "bg-orange-500",
    category: "condition",
  },
  {
    type: "action_notification",
    label: "Gửi thông báo",
    description: "Gửi thông báo nội bộ cho nhân viên",
    colorClass: "bg-green-500",
    category: "action",
  },
  {
    type: "action_assign",
    label: "Phân công Sale",
    description: "Gán nhân viên phụ trách cho lead",
    colorClass: "bg-purple-500",
    category: "action",
  },
  {
    type: "action_update_stage",
    label: "Cập nhật Pipeline",
    description: "Chuyển lead sang giai đoạn khác",
    colorClass: "bg-teal-500",
    category: "action",
  },
  {
    type: "action_activity",
    label: "Ghi hoạt động",
    description: "Tạo hoạt động chăm sóc cho lead",
    colorClass: "bg-indigo-500",
    category: "action",
  },
  {
    type: "delay",
    label: "Chờ / Delay",
    description: "Tạm dừng trước khi thực hiện bước tiếp theo",
    colorClass: "bg-yellow-500",
    category: "delay",
  },
];
