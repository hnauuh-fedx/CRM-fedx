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
  pipelineStageIds: new Set(["stage-1"]),
  targetRoleCodes: new Set(["SALE"]),
  customFieldDataTypes: new Map([["custom:field-1", "TEXT"]]),
  canAssign: true,
  canUpdateLead: true,
  canWriteActivity: true,
  canViewSensitiveData: true,
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
