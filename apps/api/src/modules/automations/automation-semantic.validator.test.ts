import assert from "node:assert/strict";
import test from "node:test";

import { validateAutomationSemantics } from "./automation-semantic.validator";
import type { AutomationGraphData } from "./automation.types";

const graph = (nodes: AutomationGraphData["nodes"]): AutomationGraphData => ({ nodes, edges: [] });
const node = (id: string, type: AutomationGraphData["nodes"][number]["type"], data: Record<string, unknown>) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { label: id, ...data },
});

const catalog = {
    assigneeIds: new Set(["user-1"]),
    departmentIds: new Set(["department-1"]),
  pipelineStageIds: new Set(["stage-1"]),
  targetRoleCodes: new Set(["SALE"]),
  customerListIds: new Set(["list-1"]),
  webhookEndpointIds: new Set(["endpoint-1"]),
  majorIds: new Set(["major-1"]),
  admissionStatusIds: new Set(["status-1"]),
  approvedAdmissionStatusIds: new Set(["status-approved"]),
  enrolledAdmissionStatusIds: new Set(["status-enrolled"]),
  restrictedAdmissionCreationStatusIds: new Set(["status-approved", "status-enrolled"]),
  admissionClassIds: new Set(["class-1"]),
  customFieldDataTypes: new Map([["custom:field-1", "TEXT"]]),
  canAssign: true,
  canCreateReminder: true,
  canUpdateLead: true,
  canWriteActivity: true,
  canViewSensitiveData: true,
  canSendMessage: true,
  canCallWebhook: true,
  canCreateAdmission: true,
  canRequestAdmissionDocument: true,
  canUpdateAdmissionStatus: true,
  canChangeAdmissionStatus: true,
  canApproveAdmission: true,
  canConvertStudent: true,
};

test("accepts references that exist in the scoped catalog", () => {
  const result = validateAutomationSemantics(graph([
    node("condition", "condition", {
      conditionCombinator: "AND",
      conditions: [{ field: "custom:field-1", operator: "equals", value: "yes" }],
    }),
    node("assign", "action_assign", { assignToUserId: "user-1" }),
    node("stage", "action_update_stage", { stageId: "stage-1" }),
    node("notify", "action_notification", { targetRole: "SALE", title: "Lead", content: "{{custom:field-1}}" }),
  ]), catalog);

  assert.deepEqual(result, []);
});

test("rejects unavailable scoped references and assignment without permission", () => {
  const result = validateAutomationSemantics(graph([
    node("condition", "condition", { field: "custom:missing", operator: "exists" }),
    node("assign", "action_assign", { assignToUserId: "user-missing" }),
    node("stage", "action_update_stage", { stageId: "stage-missing" }),
    node("notify", "action_notification", { targetRole: "MISSING", title: "Lead", content: "{{custom:missing}}" }),
  ]), { ...catalog, canAssign: false });

  assert.equal(result.filter((issue) => issue.code === "INVALID_REFERENCE").length, 5);
  assert.ok(result.some((issue) => issue.code === "INSUFFICIENT_PERMISSION" && issue.nodeId === "assign"));
});

test("rejects an operator that is incompatible with a custom field data type", () => {
  const result = validateAutomationSemantics(graph([
    node("condition", "condition", { field: "custom:number", operator: "contains", value: "1" }),
  ]), {
    ...catalog,
    customFieldDataTypes: new Map([["custom:number", "NUMBER"]]),
  });

  assert.ok(result.some((issue) => issue.code === "INVALID_NODE_CONFIG" && issue.nodeId === "condition"));
});

test("rejects unknown system fields and sensitive fields without permission", () => {
  const result = validateAutomationSemantics(graph([
    node("condition", "condition", {
      conditionCombinator: "AND",
      conditions: [
        { field: "system:notReal", operator: "exists" },
        { field: "system:phone", operator: "exists" },
      ],
    }),
  ]), { ...catalog, canViewSensitiveData: false });

  assert.ok(result.some((issue) => issue.code === "INVALID_REFERENCE"));
  assert.ok(result.some((issue) => issue.code === "INSUFFICIENT_PERMISSION"));
});

test("rejects an unknown template token", () => {
  const result = validateAutomationSemantics(graph([
    node("notify", "action_notification", { targetRole: "SALE", title: "Lead", content: "{{unknownToken}}" }),
  ]), catalog);

  assert.ok(result.some((issue) => issue.code === "INVALID_REFERENCE" && issue.nodeId === "notify"));
});

test("validates admission-native references and permissions", () => {
  const result = validateAutomationSemantics(graph([
    node("create", "action_create_admission", { admissionMajorId: "major-1", admissionStatusId: "status-1" }),
    node("status", "action_update_admission_status", { admissionStatusId: "status-missing" }),
    node("convert", "action_convert_student", { admissionClassId: "class-1" }),
  ]), { ...catalog, canCreateAdmission: false });

  assert.ok(result.some((issue) => issue.code === "INSUFFICIENT_PERMISSION" && issue.nodeId === "create"));
  assert.ok(result.some((issue) => issue.code === "INVALID_REFERENCE" && issue.nodeId === "status"));
});

test("approved admission status requires approval permission", () => {
  const result = validateAutomationSemantics(graph([
    node("approve", "action_update_admission_status", { admissionStatusId: "status-approved" }),
  ]), {
    ...catalog,
    admissionStatusIds: new Set(["status-approved"]),
    canApproveAdmission: false,
  });

  assert.ok(result.some((issue) => issue.code === "INSUFFICIENT_PERMISSION" && issue.nodeId === "approve"));
});

test("approval-only actor can configure approval but not ordinary status changes", () => {
  const approved = validateAutomationSemantics(graph([
    node("approve", "action_update_admission_status", { admissionStatusId: "status-approved" }),
  ]), {
    ...catalog,
    admissionStatusIds: new Set(["status-approved"]),
    canUpdateAdmissionStatus: true,
    canChangeAdmissionStatus: false,
    canApproveAdmission: true,
  });
  const ordinary = validateAutomationSemantics(graph([
    node("change", "action_update_admission_status", { admissionStatusId: "status-1" }),
  ]), {
    ...catalog,
    canUpdateAdmissionStatus: true,
    canChangeAdmissionStatus: false,
    canApproveAdmission: true,
  });

  assert.deepEqual(approved, []);
  assert.ok(ordinary.some((issue) => issue.code === "INSUFFICIENT_PERMISSION" && issue.nodeId === "change"));
});

test("admission profile cannot be created directly as approved or enrolled", () => {
  const result = validateAutomationSemantics(graph([
    node("create-approved", "action_create_admission", {
      admissionMajorId: "major-1",
      admissionStatusId: "status-approved",
    }),
    node("create-enrolled", "action_create_admission", {
      admissionMajorId: "major-1",
      admissionStatusId: "status-enrolled",
    }),
  ]), {
    ...catalog,
    admissionStatusIds: new Set(["status-approved", "status-enrolled"]),
  });

  assert.ok(result.some((issue) => issue.code === "INVALID_NODE_CONFIG" && issue.nodeId === "create-approved"));
  assert.ok(result.some((issue) => issue.code === "INVALID_NODE_CONFIG" && issue.nodeId === "create-enrolled"));
});

test("admission status action cannot bypass student conversion with enrolled status", () => {
  const result = validateAutomationSemantics(graph([
    node("enroll", "action_update_admission_status", { admissionStatusId: "status-enrolled" }),
  ]), {
    ...catalog,
    admissionStatusIds: new Set(["status-enrolled"]),
  });

  assert.ok(result.some((issue) => issue.code === "INVALID_NODE_CONFIG" && issue.nodeId === "enroll"));
});
