import assert from "node:assert/strict";
import test from "node:test";

import { REGISTERED_AUTOMATION_EXECUTOR_TYPES } from "./automation-action-registry";
import {
  AUTOMATION_REGISTRY,
  getAutomationNodeDefinition,
  validateRegisteredAutomationNode,
} from "./automation-registry";
import type { AutomationNode } from "./automation.types";

test("registry exposes every supported builder node with a unique type", () => {
  const nodeTypes = AUTOMATION_REGISTRY.nodes.map((node) => node.type);

  assert.equal(new Set(nodeTypes).size, nodeTypes.length);
  assert.deepEqual(nodeTypes, [
    "trigger",
    "condition",
    "action_notification",
    "action_assign",
    "action_assign_pool",
    "action_update_stage",
    "action_activity",
    "action_reminder",
    "action_message",
    "action_webhook",
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

test("every executable node is fully registered without orchestrator knowledge", () => {
  const executableNodes = AUTOMATION_REGISTRY.nodes.filter((node) => node.category !== "trigger");

  assert.deepEqual([...REGISTERED_AUTOMATION_EXECUTOR_TYPES].sort(), executableNodes.map((node) => node.type).sort());
  assert.ok(executableNodes.every((node) => typeof node.icon === "string" && typeof node.tone === "string"));
});

test("registry owns node config validation", () => {
  const invalidAssign: AutomationNode = {
    id: "assign-1",
    type: "action_assign",
    position: { x: 0, y: 0 },
    data: { label: "Phân công" },
  };

  assert.deepEqual(validateRegisteredAutomationNode(invalidAssign), ["Node phân công assign-1 chưa chọn nhân viên."]);
});

test("registry validates the phase 3 assignment pool configuration", () => {
  const invalidPool: AutomationNode = {
    id: "pool-1",
    type: "action_assign_pool",
    position: { x: 0, y: 0 },
    data: { label: "Chia Lead", assignmentStrategy: "round_robin", assigneeIds: [] },
  };
  const validPool: AutomationNode = {
    ...invalidPool,
    data: { ...invalidPool.data, assigneeIds: ["user-1", "user-2"] },
  };

  assert.equal(validateRegisteredAutomationNode(invalidPool).length, 1);
  assert.deepEqual(validateRegisteredAutomationNode(validPool), []);
});

test("SLA duration is required only for the unprocessed-lead trigger", () => {
  const leadCreated: AutomationNode = {
    id: "trigger-1",
    type: "trigger",
    position: { x: 0, y: 0 },
    data: { label: "Lead mới", triggerType: "lead_created" },
  };
  const unprocessed: AutomationNode = {
    ...leadCreated,
    data: { label: "Lead chưa xử lý", triggerType: "lead_unprocessed" },
  };

  assert.deepEqual(validateRegisteredAutomationNode(leadCreated), []);
  assert.equal(validateRegisteredAutomationNode(unprocessed).length, 1);
});

test("registry publishes system fields and sensitive metadata for the builder", () => {
  const phone = AUTOMATION_REGISTRY.fields.find((field) => field.reference === "system:phone");
  const pipelineStage = AUTOMATION_REGISTRY.fields.find((field) => field.reference === "system:pipelineStageId");

  assert.equal(phone?.dataType, "PHONE");
  assert.equal(phone?.isSensitive, true);
  assert.equal(pipelineStage?.optionSource, "pipelineStages");
});
