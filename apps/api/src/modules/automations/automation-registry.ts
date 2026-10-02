import { AUTOMATION_SYSTEM_FIELDS } from "./automation-field-registry";
import type { AutomationNode, AutomationNodeData, AutomationNodeType } from "./automation.types";

export type AutomationConfigControl =
  | "condition_group"
  | "number"
  | "select"
  | "template_text"
  | "template_textarea"
  | "text";

export type AutomationConfigField = {
  key: keyof AutomationNodeData;
  label: string;
  control: AutomationConfigControl;
  required: boolean;
  optionsSource?: "assignees" | "pipelineStages" | "targetRoles";
  options?: Array<{ code: string; label: string }>;
  min?: number;
};

export type AutomationNodeDefinition = {
  type: AutomationNodeType;
  category: "trigger" | "condition" | "action" | "delay";
  label: string;
  description: string;
  icon: "bell" | "clock" | "git-branch" | "notebook" | "refresh" | "user-plus" | "zap";
  tone: "blue" | "green" | "indigo" | "orange" | "purple" | "teal" | "yellow";
  defaultData?: Partial<AutomationNodeData>;
  requiredCapabilities?: Array<"assign" | "updateLead" | "writeActivity">;
  configFields: AutomationConfigField[];
};

const nodes: AutomationNodeDefinition[] = [
  { type: "trigger", category: "trigger", label: "Khởi động", description: "Điểm bắt đầu của quy trình", icon: "zap", tone: "blue", configFields: [] },
  {
    type: "condition", category: "condition", label: "Điều kiện", description: "Kết hợp nhiều tiêu chí bằng AND hoặc OR", icon: "git-branch", tone: "orange",
    defaultData: { conditionCombinator: "AND", conditions: [{ field: "", operator: "equals", value: "" }] },
    configFields: [{ key: "conditions", label: "Nhóm điều kiện", control: "condition_group", required: true }],
  },
  {
    type: "action_notification", category: "action", label: "Gửi thông báo", description: "Gửi thông báo nội bộ cho nhân viên", icon: "bell", tone: "green",
    configFields: [
      { key: "targetRole", label: "Vai trò nhận thông báo", control: "select", required: true, optionsSource: "targetRoles" },
      { key: "title", label: "Tiêu đề thông báo", control: "template_text", required: true },
      { key: "content", label: "Nội dung thông báo", control: "template_textarea", required: true },
    ],
  },
  {
    type: "action_assign", category: "action", label: "Phân công Sale", description: "Gán nhân viên phụ trách cho lead", icon: "user-plus", tone: "purple", requiredCapabilities: ["assign"],
    configFields: [{ key: "assignToUserId", label: "Nhân viên phụ trách", control: "select", required: true, optionsSource: "assignees" }],
  },
  {
    type: "action_update_stage", category: "action", label: "Cập nhật Pipeline", description: "Chuyển lead sang giai đoạn khác", icon: "refresh", tone: "teal", requiredCapabilities: ["updateLead"],
    configFields: [{ key: "stageId", label: "Chuyển sang giai đoạn", control: "select", required: true, optionsSource: "pipelineStages" }],
  },
  {
    type: "action_activity", category: "action", label: "Ghi hoạt động", description: "Tạo hoạt động chăm sóc cho lead", icon: "notebook", tone: "indigo", requiredCapabilities: ["writeActivity"],
    configFields: [
      {
        key: "activityType", label: "Loại hoạt động", control: "select", required: true,
        options: [
          { code: "call", label: "Gọi điện thoại" },
          { code: "email", label: "Gửi Email" },
          { code: "meeting", label: "Hẹn gặp" },
          { code: "note", label: "Ghi chú" },
        ],
      },
      { key: "activityContent", label: "Nội dung ghi nhận", control: "template_textarea", required: true },
    ],
  },
  {
    type: "delay", category: "delay", label: "Chờ / Delay", description: "Tạm dừng trước khi thực hiện bước tiếp theo", icon: "clock", tone: "yellow", defaultData: { delayMinutes: 1 },
    configFields: [{ key: "delayMinutes", label: "Thời gian chờ (phút)", control: "number", required: true, min: 1 }],
  },
];

export const AUTOMATION_TRIGGER_TYPES = ["lead_created", "lead_pipeline_stage_changed", "lead_assigned"] as const;

const automationTriggerLabels: Record<(typeof AUTOMATION_TRIGGER_TYPES)[number], string> = {
  lead_created: "Lead được tạo mới",
  lead_pipeline_stage_changed: "Lead đổi giai đoạn pipeline",
  lead_assigned: "Lead được phân công",
};

export const AUTOMATION_REGISTRY = {
  version: 1,
  triggers: AUTOMATION_TRIGGER_TYPES.map((code) => ({ code, label: automationTriggerLabels[code] })),
  nodes,
  fields: AUTOMATION_SYSTEM_FIELDS,
  operators: [
    { code: "equals", label: "Bằng", requiresValue: true, dataTypes: ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"] },
    { code: "not_equals", label: "Khác", requiresValue: true, dataTypes: ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"] },
    { code: "contains", label: "Chứa", requiresValue: true, dataTypes: ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "MULTI_SELECT"] },
    { code: "not_contains", label: "Không chứa", requiresValue: true, dataTypes: ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "MULTI_SELECT"] },
    { code: "exists", label: "Có dữ liệu", requiresValue: false, dataTypes: ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"] },
    { code: "empty", label: "Không có dữ liệu", requiresValue: false, dataTypes: ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"] },
    { code: "greater_than", label: "Lớn hơn", requiresValue: true, dataTypes: ["NUMBER"] },
    { code: "less_than", label: "Nhỏ hơn", requiresValue: true, dataTypes: ["NUMBER"] },
    { code: "before", label: "Trước ngày", requiresValue: true, dataTypes: ["DATE"] },
    { code: "after", label: "Sau ngày", requiresValue: true, dataTypes: ["DATE"] },
    { code: "in", label: "Thuộc một trong", requiresValue: true, dataTypes: ["TEXT", "EMAIL", "PHONE", "NUMBER", "DATE", "SELECT", "MULTI_SELECT"] },
    { code: "not_in", label: "Không thuộc", requiresValue: true, dataTypes: ["TEXT", "EMAIL", "PHONE", "NUMBER", "DATE", "SELECT", "MULTI_SELECT"] },
  ],
} as const;

export function getAutomationNodeDefinition(type: AutomationNodeType) {
  return nodes.find((definition) => definition.type === type);
}

export function validateRegisteredAutomationNode(node: AutomationNode): string[] {
  const issues: string[] = [];
  const missing = (message: string) => issues.push(message);
  const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;

  if (!node.data.label?.trim()) missing(`Node ${node.id} phải có tên hiển thị.`);
  if (!getAutomationNodeDefinition(node.type)) return [...issues, `Loại node ${node.type} chưa được đăng ký.`];

  if (node.type === "condition") {
    const conditions = node.data.conditions ?? (node.data.field || node.data.operator
      ? [{ field: node.data.field ?? "", operator: node.data.operator ?? "", value: node.data.value }]
      : []);
    if (node.data.conditions && node.data.conditionCombinator !== "AND" && node.data.conditionCombinator !== "OR") {
      missing(`Node điều kiện ${node.id} phải chọn cách kết hợp AND hoặc OR.`);
    }
    if (!Array.isArray(conditions) || conditions.length === 0) {
      missing(`Node điều kiện ${node.id} phải có ít nhất một tiêu chí.`);
    } else {
      conditions.forEach((condition, index) => {
        if (!condition || typeof condition !== "object") {
          missing(`Tiêu chí ${index + 1} của node ${node.id} không đúng cấu trúc.`);
          return;
        }
        const operator = AUTOMATION_REGISTRY.operators.find((candidate) => candidate.code === condition.operator);
        if (!condition.field || !condition.operator) missing(`Tiêu chí ${index + 1} của node ${node.id} chưa chọn trường hoặc toán tử.`);
        if (condition.operator && !operator) missing(`Tiêu chí ${index + 1} của node ${node.id} dùng toán tử không được hỗ trợ.`);
        if (operator?.requiresValue !== false && !hasText(condition.value)) missing(`Tiêu chí ${index + 1} của node ${node.id} chưa có giá trị so sánh.`);
      });
    }
    return issues;
  }

  for (const field of getAutomationNodeDefinition(node.type)?.configFields ?? []) {
    const value = node.data[field.key];
    if (!field.required) continue;
    const valid = field.control === "number" ? Number.isFinite(Number(value)) && Number(value) >= (field.min ?? Number.NEGATIVE_INFINITY) : hasText(value);
    if (!valid) {
      const messages: Partial<Record<AutomationNodeType, string>> = {
        action_notification: `Node thông báo ${node.id} phải có tiêu đề, nội dung và vai trò nhận.`,
        action_assign: `Node phân công ${node.id} chưa chọn nhân viên.`,
        action_update_stage: `Node cập nhật pipeline ${node.id} chưa chọn giai đoạn.`,
        action_activity: `Node hoạt động ${node.id} phải có loại và nội dung.`,
        delay: `Node chờ ${node.id} phải có thời gian lớn hơn 0 phút.`,
      };
      const message = messages[node.type] ?? `Node ${node.id} chưa cấu hình trường ${field.label}.`;
      if (!issues.includes(message)) missing(message);
    }
  }
  return issues;
}
