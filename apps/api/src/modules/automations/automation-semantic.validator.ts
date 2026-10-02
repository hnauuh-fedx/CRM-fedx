import { getAutomationTemplateReferences } from "./automation-data-field.service";
import type { AutomationGraphValidationIssue } from "./automation-graph.validator";
import { AUTOMATION_REGISTRY } from "./automation-registry";
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

const SYSTEM_FIELD_DATA_TYPES = new Map<string, string>([
  ...["fullName", "birthPlace", "cccd", "cccdIssuePlace", "ethnicity", "religion", "nationality", "graduationCertificate", "previousGraduationCertificate", "diplomaIssuePlace", "graduationMajor", "graduationRank", "academicRank12", "conductRank12", "highSchoolName", "highSchoolDistrict", "highSchoolProvince", "hamlet", "ward", "district", "province", "currentJob", "companyName", "relative1FullName", "relative1Relationship", "relative1Job", "relative2FullName", "relative2Relationship", "relative2Job", "trainingCode", "classCode", "subjectGroupCode", "subjectGroupName", "enrollmentBatch", "registrationStation", "decisionNumber", "temperature", "gclid"].map((key) => [`system:${key}`, "TEXT"] as const),
  ...["specificAddress", "currentAddress", "permanentAddress", "currentResidence", "relative1Address", "relative2Address", "note"].map((key) => [`system:${key}`, "TEXTAREA"] as const),
  ...["graduationYear", "score1", "score2", "score3", "admissionScore", "monthlyRevenue"].map((key) => [`system:${key}`, "NUMBER"] as const),
  ...["dateOfBirth", "cccdIssueDate", "decisionSignedDate"].map((key) => [`system:${key}`, "DATE"] as const),
  ...["sourceId", "gender", "majorId", "admissionStatusId", "pipelineStageId", "institutionProgramId", "assigneeId"].map((key) => [`system:${key}`, "SELECT"] as const),
  ["system:phone", "PHONE"],
  ["system:relative1Phone", "PHONE"],
  ["system:relative2Phone", "PHONE"],
  ["system:email", "EMAIL"],
  ["system:tags", "MULTI_SELECT"],
]);

const SENSITIVE_SYSTEM_FIELDS = new Set([
  "system:phone", "system:email", "system:dateOfBirth", "system:cccd", "system:cccdIssueDate",
  "system:cccdIssuePlace", "system:specificAddress", "system:currentAddress", "system:permanentAddress",
  "system:currentResidence", "system:relative1FullName", "system:relative1Phone", "system:relative1Address",
  "system:relative2FullName", "system:relative2Phone", "system:relative2Address",
]);

const LEGACY_FIELD_REFERENCES = new Map([
  ["source_id", "system:sourceId"],
  ["pipeline_stage_id", "system:pipelineStageId"],
  ["status", "system:pipelineStageId"],
  ["assigned_to", "system:assigneeId"],
  ["institution_program_id", "system:institutionProgramId"],
  ["full_name", "system:fullName"],
]);

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

    if (node.type === "action_assign") {
      if (!catalog.canAssign) {
        issues.push({
          code: "INSUFFICIENT_PERMISSION",
          nodeId: node.id,
          message: `Bạn không có quyền phân công Lead cho node ${node.id}.`,
        });
      }
      if (node.data.assignToUserId && !catalog.assigneeIds.has(node.data.assignToUserId)) {
        issues.push({
          code: "INVALID_REFERENCE",
          nodeId: node.id,
          message: `Nhân viên được chọn tại node ${node.id} không còn khả dụng trong phạm vi của rule.`,
        });
      }
    }

    if (node.type === "action_update_stage" && node.data.stageId && !catalog.pipelineStageIds.has(node.data.stageId)) {
      issues.push({
        code: "INVALID_REFERENCE",
        nodeId: node.id,
        message: `Giai đoạn pipeline tại node ${node.id} không còn tồn tại.`,
      });
    }
    if (node.type === "action_update_stage" && !catalog.canUpdateLead) {
      issues.push({
        code: "INSUFFICIENT_PERMISSION",
        nodeId: node.id,
        message: `Bạn không có quyền cập nhật Lead cho node ${node.id}.`,
      });
    }

    if (node.type === "action_activity" && !catalog.canWriteActivity) {
      issues.push({
        code: "INSUFFICIENT_PERMISSION",
        nodeId: node.id,
        message: `Bạn không có quyền ghi hoạt động Lead cho node ${node.id}.`,
      });
    }

    if (node.type === "action_notification" && node.data.targetRole && !catalog.targetRoleCodes.has(node.data.targetRole)) {
      issues.push({
        code: "INVALID_REFERENCE",
        nodeId: node.id,
        message: `Vai trò nhận thông báo tại node ${node.id} không còn tồn tại.`,
      });
    }

    const templates = [node.data.title, node.data.content, node.data.activityContent]
      .filter((value): value is string => typeof value === "string");
    for (const reference of getAutomationTemplateReferences(...templates)) {
      validateFieldReference(reference, node.id, catalog, issues);
    }
  }

  return issues;
}

function validateFieldReference(
  reference: string,
  nodeId: string,
  catalog: AutomationSemanticCatalog,
  issues: AutomationGraphValidationIssue[],
) {
  if (reference.startsWith("system:")) {
    if (!SYSTEM_FIELD_DATA_TYPES.has(reference)) {
      issues.push({ code: "INVALID_REFERENCE", nodeId, message: `Trường hệ thống ${reference} tại node ${nodeId} không tồn tại.` });
      return;
    }
    if (SENSITIVE_SYSTEM_FIELDS.has(reference) && !catalog.canViewSensitiveData) {
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
  if (LEGACY_FIELD_REFERENCES.has(reference)) return;
  issues.push({
    code: "INVALID_REFERENCE",
    nodeId,
    message: `Template token hoặc trường dữ liệu ${reference} tại node ${nodeId} không được hỗ trợ.`,
  });
}

function getFieldDataType(reference: string, catalog: AutomationSemanticCatalog) {
  const normalizedReference = LEGACY_FIELD_REFERENCES.get(reference) ?? reference;
  return catalog.customFieldDataTypes.get(normalizedReference) ?? SYSTEM_FIELD_DATA_TYPES.get(normalizedReference);
}
