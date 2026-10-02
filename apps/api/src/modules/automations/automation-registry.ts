import type { AutomationNodeData, AutomationNodeType } from "./automation.types";

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
  configFields: AutomationConfigField[];
};

const nodes: AutomationNodeDefinition[] = [
  { type: "trigger", category: "trigger", label: "Khởi động", description: "Điểm bắt đầu của quy trình", configFields: [] },
  {
    type: "condition", category: "condition", label: "Điều kiện", description: "Kết hợp nhiều tiêu chí bằng AND hoặc OR",
    configFields: [{ key: "conditions", label: "Nhóm điều kiện", control: "condition_group", required: true }],
  },
  {
    type: "action_notification", category: "action", label: "Gửi thông báo", description: "Gửi thông báo nội bộ cho nhân viên",
    configFields: [
      { key: "targetRole", label: "Vai trò nhận thông báo", control: "select", required: true, optionsSource: "targetRoles" },
      { key: "title", label: "Tiêu đề thông báo", control: "template_text", required: true },
      { key: "content", label: "Nội dung thông báo", control: "template_textarea", required: true },
    ],
  },
  {
    type: "action_assign", category: "action", label: "Phân công Sale", description: "Gán nhân viên phụ trách cho lead",
    configFields: [{ key: "assignToUserId", label: "Nhân viên phụ trách", control: "select", required: true, optionsSource: "assignees" }],
  },
  {
    type: "action_update_stage", category: "action", label: "Cập nhật Pipeline", description: "Chuyển lead sang giai đoạn khác",
    configFields: [{ key: "stageId", label: "Chuyển sang giai đoạn", control: "select", required: true, optionsSource: "pipelineStages" }],
  },
  {
    type: "action_activity", category: "action", label: "Ghi hoạt động", description: "Tạo hoạt động chăm sóc cho lead",
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
    type: "delay", category: "delay", label: "Chờ / Delay", description: "Tạm dừng trước khi thực hiện bước tiếp theo",
    configFields: [{ key: "delayMinutes", label: "Thời gian chờ (phút)", control: "number", required: true, min: 1 }],
  },
];

export const AUTOMATION_REGISTRY = {
  version: 1,
  triggers: [
    { code: "lead_created", label: "Lead được tạo mới" },
    { code: "lead_pipeline_stage_changed", label: "Lead đổi giai đoạn pipeline" },
    { code: "lead_assigned", label: "Lead được phân công" },
  ],
  nodes,
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
