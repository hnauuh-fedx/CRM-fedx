import { getAutomationTemplateReferences } from "./automation-data-field.service";
import { getAutomationSystemField, normalizeAutomationFieldReference } from "./automation-field-registry";
import type { AutomationGraphValidationIssue } from "./automation-graph.validator";
import { AUTOMATION_REGISTRY, getAutomationNodeDefinition } from "./automation-registry";
import type { AutomationGraphData } from "./automation.types";
import { isValidAutomationSchedule } from "./automation-schedule";

export type AutomationSemanticCatalog = {
  assigneeIds: Set<string>;
  departmentIds: Set<string>;
  pipelineStageIds: Set<string>;
  targetRoleCodes: Set<string>;
  customerListIds: Set<string>;
  webhookEndpointIds: Set<string>;
  customFieldDataTypes: Map<string, string>;
  canAssign: boolean;
  canCreateReminder: boolean;
  canUpdateLead: boolean;
  canWriteActivity: boolean;
  canViewSensitiveData: boolean;
  canSendMessage: boolean;
  canCallWebhook: boolean;
};

export function validateAutomationSemantics(
  graph: AutomationGraphData,
  catalog: AutomationSemanticCatalog,
): AutomationGraphValidationIssue[] {
  const issues: AutomationGraphValidationIssue[] = [];

  for (const node of graph.nodes) {
    if (node.type === "trigger" && node.data.triggerType === "scheduled" && node.data.scheduleTimezone && node.data.scheduleTime && node.data.scheduleDays) {
      if (!isValidAutomationSchedule({
        timezone: node.data.scheduleTimezone,
        time: node.data.scheduleTime,
        days: node.data.scheduleDays,
        excludedDates: node.data.scheduleExcludedDates,
      })) {
        issues.push({ code: "INVALID_NODE_CONFIG", nodeId: node.id, message: `Cấu hình lịch tại node ${node.id} không hợp lệ.` });
      }
    }
    if (node.type === "condition") {
      const conditions = node.data.conditions?.length
        ? node.data.conditions
        : [{ field: node.data.field ?? "", operator: node.data.operator ?? "", value: node.data.value }];
      for (const condition of conditions) {
        validateFieldReference(condition.field, node.id, catalog, issues);
        const dataType = getFieldDataType(condition.field, catalog);
        const operator = AUTOMATION_REGISTRY.operators.find((candidate) => candidate.code === condition.operator);
        if (dataType && operator && !operator.dataTypes.some((supportedType) => supportedType === dataType)) {
          issues.push({
            code: "INVALID_NODE_CONFIG",
            nodeId: node.id,
            message: `Toán tử ${condition.operator} không hỗ trợ kiểu dữ liệu ${dataType} tại node ${node.id}.`,
          });
        }
      }
    }

    const definition = getAutomationNodeDefinition(node.type);
    for (const capability of definition?.requiredCapabilities ?? []) {
      const check = capabilityChecks[capability];
      if (!check.allowed(catalog)) {
        issues.push({ code: "INSUFFICIENT_PERMISSION", nodeId: node.id, message: check.message(node.id) });
      }
    }

    for (const field of definition?.configFields ?? []) {
      const value = node.data[field.key];
      const references = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" && value ? [value] : [];
      const optionCheck = field.optionsSource ? optionReferenceChecks[field.optionsSource] : undefined;
      if (optionCheck && references.some((reference) => !optionCheck.exists(reference, catalog))) {
        issues.push({
          code: "INVALID_REFERENCE",
          nodeId: node.id,
          message: optionCheck.message(node.id),
        });
      }
    }

    const templates = (definition?.configFields ?? [])
      .filter((field) => field.control === "template_text" || field.control === "template_textarea")
      .map((field) => node.data[field.key])
      .filter((value): value is string => typeof value === "string");
    for (const reference of getAutomationTemplateReferences(...templates)) {
      validateFieldReference(reference, node.id, catalog, issues);
    }
  }

  return issues;
}

const capabilityChecks = {
  assign: {
    allowed: (catalog: AutomationSemanticCatalog) => catalog.canAssign,
    message: (nodeId: string) => `Bạn không có quyền phân công Lead cho node ${nodeId}.`,
  },
  createReminder: {
    allowed: (catalog: AutomationSemanticCatalog) => catalog.canCreateReminder,
    message: (nodeId: string) => `Bạn không có quyền tạo nhắc việc cho node ${nodeId}.`,
  },
  updateLead: {
    allowed: (catalog: AutomationSemanticCatalog) => catalog.canUpdateLead,
    message: (nodeId: string) => `Bạn không có quyền cập nhật Lead cho node ${nodeId}.`,
  },
  writeActivity: {
    allowed: (catalog: AutomationSemanticCatalog) => catalog.canWriteActivity,
    message: (nodeId: string) => `Bạn không có quyền ghi hoạt động Lead cho node ${nodeId}.`,
  },
  sendMessage: {
    allowed: (catalog: AutomationSemanticCatalog) => catalog.canSendMessage,
    message: (nodeId: string) => `Tài khoản thực thi không có quyền dùng thông tin liên hệ để gửi tin tại node ${nodeId}.`,
  },
  callWebhook: {
    allowed: (catalog: AutomationSemanticCatalog) => catalog.canCallWebhook,
    message: (nodeId: string) => `Tài khoản thực thi không có quyền gọi webhook tại node ${nodeId}.`,
  },
};

const optionReferenceChecks: Partial<Record<"assignees" | "departments" | "pipelineStages" | "targetRoles" | "customerLists" | "webhookEndpoints", {
  exists: (value: string, catalog: AutomationSemanticCatalog) => boolean;
  message: (nodeId: string) => string;
}>> = {
  assignees: {
    exists: (value, catalog) => catalog.assigneeIds.has(value),
    message: (nodeId) => `Nhân viên được chọn tại node ${nodeId} không còn khả dụng trong phạm vi của rule.`,
  },
  departments: {
    exists: (value, catalog) => catalog.departmentIds.has(value),
    message: (nodeId) => `Team/phòng ban tại node ${nodeId} không còn tồn tại hoặc nằm ngoài phạm vi.`,
  },
  pipelineStages: {
    exists: (value, catalog) => catalog.pipelineStageIds.has(value),
    message: (nodeId) => `Giai đoạn pipeline tại node ${nodeId} không còn tồn tại.`,
  },
  targetRoles: {
    exists: (value, catalog) => catalog.targetRoleCodes.has(value),
    message: (nodeId) => `Vai trò nhận thông báo tại node ${nodeId} không còn tồn tại.`,
  },
  customerLists: {
    exists: (value, catalog) => catalog.customerListIds.has(value),
    message: (nodeId) => `Danh sách khách hàng tại node ${nodeId} không tồn tại hoặc nằm ngoài phạm vi.`,
  },
  webhookEndpoints: {
    exists: (value, catalog) => catalog.webhookEndpointIds.has(value),
    message: (nodeId) => `Webhook endpoint tại node ${nodeId} không tồn tại hoặc nằm ngoài phạm vi.`,
  },
};

function validateFieldReference(
  reference: string,
  nodeId: string,
  catalog: AutomationSemanticCatalog,
  issues: AutomationGraphValidationIssue[],
) {
  if (reference.startsWith("system:")) {
    const field = getAutomationSystemField(reference);
    if (!field) {
      issues.push({ code: "INVALID_REFERENCE", nodeId, message: `Trường hệ thống ${reference} tại node ${nodeId} không tồn tại.` });
      return;
    }
    if (field.isSensitive && !catalog.canViewSensitiveData) {
      issues.push({ code: "INSUFFICIENT_PERMISSION", nodeId, message: `Bạn không có quyền dùng trường nhạy cảm ${reference} tại node ${nodeId}.` });
    }
    return;
  }
  if (reference.startsWith("custom:")) {
    if (catalog.customFieldDataTypes.has(reference)) return;
    issues.push({
      code: "INVALID_REFERENCE",
      nodeId,
      message: `Trường dữ liệu ${reference} tại node ${nodeId} không tồn tại hoặc nằm ngoài phạm vi truy cập.`,
    });
    return;
  }
  if (normalizeAutomationFieldReference(reference) !== reference) return;
  issues.push({
    code: "INVALID_REFERENCE",
    nodeId,
    message: `Template token hoặc trường dữ liệu ${reference} tại node ${nodeId} không được hỗ trợ.`,
  });
}

function getFieldDataType(reference: string, catalog: AutomationSemanticCatalog) {
  const normalizedReference = normalizeAutomationFieldReference(reference);
  return catalog.customFieldDataTypes.get(normalizedReference) ?? getAutomationSystemField(normalizedReference)?.dataType;
}
