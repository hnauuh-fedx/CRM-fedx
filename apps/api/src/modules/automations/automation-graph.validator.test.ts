import assert from "node:assert/strict";
import test from "node:test";

import type { AutomationGraphData, AutomationNode } from "./automation.types";
import { validateAutomationGraph } from "./automation-graph.validator";

function node(id: string, type: AutomationNode["type"], data: AutomationNode["data"]): AutomationNode {
  return { id, type, data, position: { x: 0, y: 0 } };
}

test("accepts a connected trigger-condition-action graph", () => {
  const graph: AutomationGraphData = {
    nodes: [
      node("root", "trigger", { label: "Khởi động" }),
      node("condition", "condition", { label: "Có người phụ trách", field: "assigned_to", operator: "exists" }),
      node("activity", "action_activity", { label: "Ghi hoạt động", activityType: "note", activityContent: "Đã kiểm tra" }),
    ],
    edges: [
      { id: "root-condition", source: "root", target: "condition", sourceHandle: "default" },
      { id: "condition-activity", source: "condition", target: "activity", sourceHandle: "default" },
    ],
  };

  assert.deepEqual(validateAutomationGraph(graph), { valid: true, issues: [] });
});

test("rejects a disconnected node", () => {
  const graph: AutomationGraphData = {
    nodes: [
      node("root", "trigger", { label: "Khởi động" }),
      node("activity", "action_activity", { label: "Ghi hoạt động", activityType: "note", activityContent: "Đã kiểm tra" }),
      node("orphan", "delay", { label: "Chờ", delayMinutes: 5 }),
    ],
    edges: [{ id: "root-activity", source: "root", target: "activity", sourceHandle: "default" }],
  };

  const result = validateAutomationGraph(graph);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "UNREACHABLE_NODE" && issue.nodeId === "orphan"));
});

test("rejects a cycle", () => {
  const graph: AutomationGraphData = {
    nodes: [
      node("root", "trigger", { label: "Khởi động" }),
      node("first", "delay", { label: "Chờ", delayMinutes: 5 }),
      node("second", "delay", { label: "Chờ tiếp", delayMinutes: 5 }),
    ],
    edges: [
      { id: "root-first", source: "root", target: "first", sourceHandle: "default" },
      { id: "first-second", source: "first", target: "second", sourceHandle: "default" },
      { id: "second-first", source: "second", target: "first", sourceHandle: "default" },
    ],
  };

  assert.ok(validateAutomationGraph(graph).issues.some((issue) => issue.code === "CYCLE_DETECTED"));
});

test("rejects an action with missing required configuration", () => {
  const graph: AutomationGraphData = {
    nodes: [
      node("root", "trigger", { label: "Khởi động" }),
      node("notification", "action_notification", { label: "Thông báo", title: "Lead mới" }),
    ],
    edges: [{ id: "root-notification", source: "root", target: "notification", sourceHandle: "default" }],
  };

  const result = validateAutomationGraph(graph);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "INVALID_NODE_CONFIG" && issue.nodeId === "notification"));
});

test("rejects fan-out from an action until durable branch finalization is available", () => {
  const graph: AutomationGraphData = {
    nodes: [
      node("root", "trigger", { label: "Khởi động" }),
      node("activity", "action_activity", { label: "Ghi hoạt động", activityType: "note", activityContent: "Đã kiểm tra" }),
      node("delay-a", "delay", { label: "Chờ A", delayMinutes: 5 }),
      node("delay-b", "delay", { label: "Chờ B", delayMinutes: 5 }),
    ],
    edges: [
      { id: "root-activity", source: "root", target: "activity", sourceHandle: "default" },
      { id: "activity-a", source: "activity", target: "delay-a", sourceHandle: "default" },
      { id: "activity-b", source: "activity", target: "delay-b", sourceHandle: "default" },
    ],
  };

  assert.ok(validateAutomationGraph(graph).issues.some((issue) => issue.code === "UNSUPPORTED_FAN_OUT" && issue.nodeId === "activity"));
});
