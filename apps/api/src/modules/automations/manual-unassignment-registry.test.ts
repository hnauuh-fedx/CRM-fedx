import assert from "node:assert/strict";
import test from "node:test";
import { AUTOMATION_REGISTRY } from "./automation-registry";
import { validateAutomationGraph } from "./automation-graph.validator";

test("manual unassignment is available to the builder and graph validator", () => {
  assert.ok(AUTOMATION_REGISTRY.triggers.some((trigger) => trigger.code === "lead_unassigned" && trigger.label.includes("thủ công")));
  assert.equal(validateAutomationGraph({
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Bỏ Sale", triggerType: "lead_unassigned" } },
      { id: "assign", type: "action_assign_pool", position: { x: 0, y: 100 }, data: { label: "Chia lại", assignmentStrategy: "round_robin", assigneeIds: ["550e8400-e29b-41d4-a716-446655440000"] } },
    ],
    edges: [{ id: "edge", source: "trigger", target: "assign" }],
  }).valid, true);
});
