import { AUTOMATION_SYSTEM_FIELDS } from "./automation-field-registry";
import type { AutomationNode, AutomationNodeData, AutomationNodeType } from "./automation.types";

export type AutomationConfigControl =
  | "condition_group"
  | "multi_select"
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

const nodes: AutomationNodeDefinition[] = [
  {
    type: "trigger", category: "trigger", label: "Khởi động", description: "Điểm bắt đầu của quy trình", icon: "zap", tone: "blue",
    configFields: [
      { key: "slaMinutes", label: "Thời gian chưa xử lý (phút)", control: "number", required: true, min: 1, visibleForTriggerTypes: ["lead_unprocessed"] },
      { key: "scheduleTimezone", label: "Múi giờ", control: "select", required: true, visibleForTriggerTypes: ["scheduled"], options: [
        { code: "Asia/Ho_Chi_Minh", label: "Việt Nam (Asia/Ho_Chi_Minh)" },
        { code: "Asia/Bangkok", label: "Bangkok (Asia/Bangkok)" },
        { code: "UTC", label: "UTC" },
      ] },
      { key: "scheduleTime", label: "Giờ chạy (HH:mm)", control: "text", required: true, visibleForTriggerTypes: ["scheduled"] },
      { key: "scheduleDays", label: "Ngày chạy", control: "multi_select", required: true, visibleForTriggerTypes: ["scheduled"], options: [
        { code: "1", label: "Thứ Hai" }, { code: "2", label: "Thứ Ba" }, { code: "3", label: "Thứ Tư" },
        { code: "4", label: "Thứ Năm" }, { code: "5", label: "Thứ Sáu" }, { code: "6", label: "Thứ Bảy" }, { code: "0", label: "Chủ nhật" },
      ] },
      { key: "scheduleExcludedDates", label: "Ngày nghỉ loại trừ (YYYY-MM-DD, cách nhau bằng dấu phẩy)", control: "text", required: false, visibleForTriggerTypes: ["scheduled"] },
      { key: "scheduleCustomerListId", label: "Danh sách khách hàng", control: "select", required: true, visibleForTriggerTypes: ["scheduled"], optionsSource: "customerLists" },
      { key: "expiryLeadDays", label: "Nhắc trước ngày hết hạn", control: "number", required: true, min: 0, visibleForTriggerTypes: ["admission_profile_expiring"] },
    ],
  },
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
    type: "action_assign_pool", category: "action", label: "Chia Lead tự động", description: "Chia vòng hoặc chọn nhân viên đang có ít Lead nhất", icon: "users", tone: "purple", requiredCapabilities: ["assign"],
    defaultData: { assignmentStrategy: "round_robin", assigneeIds: [] },
    configFields: [
      { key: "assignmentStrategy", label: "Chiến lược phân công", control: "select", required: true, options: [
        { code: "round_robin", label: "Chia vòng (Round-robin)" },
        { code: "least_loaded", label: "Ít Lead đang phụ trách nhất" },
      ] },
      { key: "departmentId", label: "Team / phòng ban (tuỳ chọn)", control: "select", required: false, optionsSource: "departments" },
      { key: "assigneeIds", label: "Danh sách nhân viên (tuỳ chọn)", control: "multi_select", required: false, optionsSource: "assignees" },
    ],
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
    type: "action_reminder", category: "action", label: "Tạo nhắc việc", description: "Tạo nhắc việc chăm sóc Lead sau một khoảng thời gian", icon: "clock", tone: "yellow", requiredCapabilities: ["createReminder"],
    defaultData: { reminderDelayMinutes: 60 },
    configFields: [
      { key: "reminderTitle", label: "Tiêu đề nhắc việc", control: "template_text", required: true },
      { key: "reminderContent", label: "Nội dung", control: "template_textarea", required: false },
      { key: "reminderDelayMinutes", label: "Nhắc sau (phút)", control: "number", required: true, min: 1 },
    ],
  },
  {
    type: "action_message", category: "action", label: "Gửi đa kênh", description: "Gửi Email, SMS hoặc ZNS có kiểm tra consent và suppression", icon: "mail", tone: "green", requiredCapabilities: ["sendMessage"],
    defaultData: { messageChannel: "email", consentPolicy: "require_consent" },
    configFields: [
      { key: "messageChannel", label: "Kênh gửi", control: "select", required: true, options: [
        { code: "email", label: "Email" }, { code: "sms", label: "SMS" }, { code: "zns", label: "ZNS" },
      ] },
      { key: "messageSubject", label: "Tiêu đề Email (nếu dùng Email)", control: "template_text", required: false },
      { key: "messageContent", label: "Nội dung", control: "template_textarea", required: true },
      { key: "consentPolicy", label: "Chính sách đồng ý nhận tin", control: "select", required: true, options: [
        { code: "require_consent", label: "Chỉ gửi khi đã đồng ý" },
        { code: "allow_unknown", label: "Cho phép khi chưa ghi nhận, vẫn chặn opt-out" },
      ] },
    ],
  },
  {
    type: "action_webhook", category: "action", label: "Gọi Webhook", description: "Gửi payload JSON có chữ ký đến endpoint đã được phê duyệt", icon: "webhook", tone: "indigo", requiredCapabilities: ["callWebhook"],
    defaultData: { webhookPayload: "{\n  \"leadName\": \"{{system:fullName}}\"\n}" },
    configFields: [
      { key: "webhookEndpointId", label: "Webhook endpoint", control: "select", required: true, optionsSource: "webhookEndpoints" },
      { key: "webhookPayload", label: "Payload JSON", control: "template_textarea", required: true },
    ],
  },
  {
    type: "action_create_admission", category: "action", label: "Tạo hồ sơ tuyển sinh", description: "Tạo hồ sơ cho Lead trong đúng chương trình của rule", icon: "file-plus", tone: "blue", requiredCapabilities: ["createAdmission"],
    configFields: [
      { key: "admissionMajorId", label: "Ngành đăng ký", control: "select", required: true, optionsSource: "majors" },
      { key: "admissionStatusId", label: "Trạng thái hồ sơ ban đầu", control: "select", required: true, optionsSource: "admissionStatuses" },
    ],
  },
  {
    type: "action_request_document", category: "action", label: "Yêu cầu tài liệu", description: "Ghi nhận tài liệu còn thiếu và thông báo người phụ trách", icon: "file-plus", tone: "orange", requiredCapabilities: ["requestAdmissionDocument"],
    configFields: [
      { key: "admissionDocumentType", label: "Loại tài liệu cần bổ sung", control: "text", required: true },
    ],
  },
  {
    type: "action_update_admission_status", category: "action", label: "Cập nhật trạng thái hồ sơ", description: "Chuyển trạng thái theo luồng tuyển sinh đã cấu hình", icon: "refresh", tone: "teal", requiredCapabilities: ["updateAdmissionStatus"],
    configFields: [
      { key: "admissionStatusId", label: "Trạng thái hồ sơ", control: "select", required: true, optionsSource: "admissionStatuses" },
    ],
  },
  {
    type: "action_convert_student", category: "action", label: "Chuyển thành sinh viên", description: "Gọi use case nhập học hiện có sau khi hồ sơ đủ điều kiện", icon: "graduation-cap", tone: "green", requiredCapabilities: ["convertStudent"],
    configFields: [
      { key: "admissionClassId", label: "Lớp sinh viên (tuỳ chọn)", control: "select", required: false, optionsSource: "admissionClasses" },
    ],
  },
  {
    type: "delay", category: "delay", label: "Chờ / Delay", description: "Tạm dừng trước khi thực hiện bước tiếp theo", icon: "clock", tone: "yellow", defaultData: { delayMinutes: 1 },
    configFields: [{ key: "delayMinutes", label: "Thời gian chờ (phút)", control: "number", required: true, min: 1 }],
  },
];

export const AUTOMATION_TRIGGER_TYPES = [
  "lead_created",
  "lead_pipeline_stage_changed",
  "lead_assigned",
  "lead_unprocessed",
  "scheduled",
  "admission_profile_created",
  "admission_status_changed",
  "admission_document_missing",
  "admission_profile_expiring",
  "admission_approved",
  "student_enrolled",
] as const;

const automationTriggerLabels: Record<(typeof AUTOMATION_TRIGGER_TYPES)[number], string> = {
  lead_created: "Lead được tạo mới",
  lead_pipeline_stage_changed: "Lead đổi giai đoạn pipeline",
  lead_assigned: "Lead được phân công",
  lead_unprocessed: "Lead chưa được xử lý quá SLA",
  scheduled: "Theo lịch định kỳ",
  admission_profile_created: "Hồ sơ tuyển sinh được tạo",
  admission_status_changed: "Hồ sơ tuyển sinh đổi trạng thái",
  admission_document_missing: "Hồ sơ thiếu tài liệu",
  admission_profile_expiring: "Hồ sơ sắp hết hạn",
  admission_approved: "Hồ sơ được duyệt",
  student_enrolled: "Thí sinh đã nhập học",
};

export const AUTOMATION_REGISTRY = {
  version: 2,
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
  const isBoundedInteger = (value: unknown, min: number, max: number) => (
    typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
  );

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

  if (node.type === "action_assign_pool" && !node.data.departmentId && !node.data.assigneeIds?.length) {
    missing(`Node chia Lead ${node.id} phải chọn team/phòng ban hoặc ít nhất một nhân viên.`);
  }

  if (node.type === "action_assign_pool" && node.data.reassignmentPolicy !== undefined) {
    const rawPolicy = node.data.reassignmentPolicy as unknown;
    if (!rawPolicy || typeof rawPolicy !== "object" || Array.isArray(rawPolicy)) {
      missing(`Node chia Lead ${node.id} có chính sách chuyển sale không đúng cấu trúc.`);
    } else {
      const policy = rawPolicy as Record<string, unknown>;
      if (typeof policy.enabled !== "boolean") {
        missing(`Node chia Lead ${node.id} phải xác định trạng thái bật chính sách chuyển sale.`);
      } else if (policy.enabled) {
        if (policy.interactionCriterion !== "not_opened_since_assignment") {
          missing(`Node chia Lead ${node.id} dùng điều kiện chuyển sale chưa được hỗ trợ.`);
        }
        if (!isBoundedInteger(policy.timeoutMinutes, 1, 43_200)) {
          missing(`Node chia Lead ${node.id} phải đặt thời gian chờ từ 1 phút đến 30 ngày.`);
        }
        if (typeof policy.assignToAnotherSale !== "boolean") {
          missing(`Node chia Lead ${node.id} phải xác định có gán cho nhân viên khác hay không.`);
        }
        if (policy.excludeCurrentAssignee !== true) {
          missing(`Node chia Lead ${node.id} không được chọn lại sale hiện tại trong V1.`);
        }
        if (!isBoundedInteger(policy.maxReassignments, 1, 100)) {
          missing(`Node chia Lead ${node.id} phải giới hạn số lần gán lại từ 1 đến 100.`);
        }
        if (typeof policy.recyclePool !== "boolean") {
          missing(`Node chia Lead ${node.id} phải xác định chính sách chia lại danh sách.`);
        }
        if (!isBoundedInteger(policy.maxPoolCycles, 1, 100)) {
          missing(`Node chia Lead ${node.id} phải giới hạn số vòng chia lại từ 1 đến 100.`);
        }
        if (typeof policy.warningEnabled !== "boolean") {
          missing(`Node chia Lead ${node.id} phải xác định trạng thái cảnh báo.`);
        } else if (policy.warningEnabled) {
          if (!isBoundedInteger(policy.warningBeforeMinutes, 1, 43_199)
            || !isBoundedInteger(policy.timeoutMinutes, 1, 43_200)
            || Number(policy.warningBeforeMinutes) >= Number(policy.timeoutMinutes)) {
            missing(`Node chia Lead ${node.id} phải cảnh báo trước thời điểm chuyển sale.`);
          }
          if (!hasText(policy.warningContent)) {
            missing(`Node chia Lead ${node.id} phải có nội dung cảnh báo.`);
          }
        }
        if (typeof policy.notifyOnRemoval !== "boolean") {
          missing(`Node chia Lead ${node.id} phải xác định có thông báo khi thu hồi hay không.`);
        }
      }
    }
  }

  for (const field of getAutomationNodeDefinition(node.type)?.configFields ?? []) {
    if (field.visibleForTriggerTypes && !field.visibleForTriggerTypes.includes(node.data.triggerType ?? "")) continue;
    const value = node.data[field.key];
    if (!field.required) continue;
    const valid = field.control === "number"
      ? Number.isFinite(Number(value)) && Number(value) >= (field.min ?? Number.NEGATIVE_INFINITY)
      : field.control === "multi_select" ? Array.isArray(value) && value.length > 0 : hasText(value);
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
