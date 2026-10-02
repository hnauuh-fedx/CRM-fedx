import { getAutomationTemplateReferences } from "./automation-data-field.service";
import { getAutomationSystemField, normalizeAutomationFieldReference } from "./automation-field-registry";
import type { AutomationGraphValidationIssue } from "./automation-graph.validator";
import { AUTOMATION_REGISTRY, getAutomationNodeDefinition } from "./automation-registry";
import type { AutomationGraphData } from "./automation.types";

export type AutomationSemanticCatalog = {
  assigneeIds: Set<string>;
  pipelineStageIds: Set<string>;
  targetRoleCodes: Set<string>;
  customFieldDataTypes: Map<string, string>;
  canAssign: boolean;
  canUpdateLead: boolean;
  canWriteActivity: boolean;
  canViewSensitiveData: boolean;
};

export function validateAutomationSemantics(
  graph: AutomationGraphData,
  catalog: AutomationSemanticCatalog,
): AutomationGraphValidationIssue[] {
  const issues: AutomationGraphValidationIssue[] = [];

  for (const node of graph.nodes) {
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
      if (field.optionsSource && typeof value === "string" && value && !optionReferenceChecks[field.optionsSource]?.exists(value, catalog)) {
        issues.push({
          code: "INVALID_REFERENCE",
          nodeId: node.id,
          message: optionReferenceChecks[field.optionsSource]?.message(node.id) ?? `Giá trị tham chiếu tại node ${node.id} không còn tồn tại.`,
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
  updateLead: {
    allowed: (catalog: AutomationSemanticCatalog) => catalog.canUpdateLead,
    message: (nodeId: string) => `Bạn không có quyền cập nhật Lead cho node ${nodeId}.`,
  },
  writeActivity: {
    allowed: (catalog: AutomationSemanticCatalog) => catalog.canWriteActivity,
    message: (nodeId: string) => `Bạn không có quyền ghi hoạt động Lead cho node ${nodeId}.`,
  },
};

const optionReferenceChecks: Partial<Record<"assignees" | "pipelineStages" | "targetRoles", {
  exists: (value: string, catalog: AutomationSemanticCatalog) => boolean;
  message: (nodeId: string) => string;
}>> = {
  assignees: {
    exists: (value, catalog) => catalog.assigneeIds.has(value),
    message: (nodeId) => `Nhân viên được chọn tại node ${nodeId} không còn khả dụng trong phạm vi của rule.`,
  },
  pipelineStages: {
    exists: (value, catalog) => catalog.pipelineStageIds.has(value),
    message: (nodeId) => `Giai đoạn pipeline tại node ${nodeId} không còn tồn tại.`,
  },
  targetRoles: {
    exists: (value, catalog) => catalog.targetRoleCodes.has(value),
    message: (nodeId) => `Vai trò nhận thông báo tại node ${nodeId} không còn tồn tại.`,
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
