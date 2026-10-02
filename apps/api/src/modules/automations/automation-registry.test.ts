import assert from "node:assert/strict";
import test from "node:test";

import { AUTOMATION_REGISTRY, getAutomationNodeDefinition } from "./automation-registry";

test("registry exposes every supported builder node with a unique type", () => {
  const nodeTypes = AUTOMATION_REGISTRY.nodes.map((node) => node.type);

  assert.equal(new Set(nodeTypes).size, nodeTypes.length);
  assert.deepEqual(nodeTypes, [
    "trigger",
    "condition",
    "action_notification",
    "action_assign",
    "action_update_stage",
    "action_activity",
    "delay",
  ]);
});

test("registry describes action configuration for API-driven builder forms", () => {
  const assign = getAutomationNodeDefinition("action_assign");

  assert.equal(assign?.category, "action");
  assert.deepEqual(assign?.configFields, [
    {
      key: "assignToUserId",
      label: "Nhân viên phụ trách",
      control: "select",
      required: true,
      optionsSource: "assignees",
    },
  ]);
});

test("registry publishes operators by compatible data type", () => {
  const contains = AUTOMATION_REGISTRY.operators.find((operator) => operator.code === "contains");
  const equals = AUTOMATION_REGISTRY.operators.find((operator) => operator.code === "equals");

  assert.deepEqual(contains?.dataTypes, ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "MULTI_SELECT"]);
  assert.ok(equals?.dataTypes.includes("SELECT"));
  assert.ok(!contains?.dataTypes.includes("NUMBER"));
});
