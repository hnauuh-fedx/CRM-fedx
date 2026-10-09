import assert from "node:assert/strict";
import test from "node:test";

import { validateRegisteredAutomationNode } from "./automation-registry.js";
import type { AutomationNode, AutomationReassignmentPolicy } from "./automation.types.js";

const validPolicy: AutomationReassignmentPolicy = {
  enabled: true,
  interactionCriterion: "not_opened_since_assignment",
  timeoutMinutes: 60,
  assignToAnotherSale: true,
  excludeCurrentAssignee: true,
  maxReassignments: 3,
  recyclePool: false,
  maxPoolCycles: 1,
  warningEnabled: true,
  warningBeforeMinutes: 30,
  warningContent: "Vui lòng mở Lead trước thời hạn.",
  warningEmailEnabled: false,
  secondWarningEnabled: true,
  secondWarningBeforeMinutes: 10,
  secondWarningContent: "Lead sắp được chuyển. Vui lòng chăm sóc ngay.",
  secondWarningEmailEnabled: false,
  notifyOnRemoval: true,
};

function node(policy: AutomationReassignmentPolicy): AutomationNode {
  return {
    id: "assign-pool",
    type: "action_assign_pool",
    position: { x: 0, y: 0 },
    data: {
      label: "Chia Lead tự động",
      assignmentStrategy: "round_robin",
      assigneeIds: ["00000000-0000-4000-8000-000000000001"],
      reassignmentPolicy: policy,
    },
  };
}

test("accepts a valid active reassignment policy", () => {
  const issues = validateRegisteredAutomationNode(node(validPolicy));
  assert.deepEqual(issues, []);
});

test("rejects invalid timeout and retry limits", () => {
  const issues = validateRegisteredAutomationNode(node({
    ...validPolicy,
    timeoutMinutes: 0,
    maxReassignments: 101,
    maxPoolCycles: 0,
  }));

  assert.ok(issues.some((issue) => issue.includes("1 phút đến 30 ngày")));
  assert.ok(issues.some((issue) => issue.includes("số lần gán lại")));
  assert.ok(issues.some((issue) => issue.includes("số vòng chia lại")));
});

test("requires an earlier in-app warning with content and excludes the current sale", () => {
  const issues = validateRegisteredAutomationNode(node({
    ...validPolicy,
    warningBeforeMinutes: validPolicy.timeoutMinutes,
    warningContent: " ",
    excludeCurrentAssignee: false as true,
  }));

  assert.ok(issues.some((issue) => issue.includes("cảnh báo trước")));
  assert.ok(issues.some((issue) => issue.includes("nội dung cảnh báo")));
  assert.ok(issues.some((issue) => issue.includes("không được chọn lại sale hiện tại")));
});

test("accepts every supported interaction criterion", () => {
  for (const interactionCriterion of [
    "not_opened_since_assignment",
    "no_care_activity_since_assignment",
    "no_data_update_since_assignment",
  ] as const) {
    assert.deepEqual(validateRegisteredAutomationNode(node({ ...validPolicy, interactionCriterion })), []);
  }
});

test("requires the second warning to be closer to expiry than the first warning", () => {
  const issues = validateRegisteredAutomationNode(node({
    ...validPolicy,
    secondWarningBeforeMinutes: validPolicy.warningBeforeMinutes,
    secondWarningContent: " ",
  }));

  assert.ok(issues.some((issue) => issue.includes("cảnh báo lần hai")));
  assert.ok(issues.some((issue) => issue.includes("nội dung cảnh báo lần hai")));
});

test("requires the first warning when the second warning is enabled", () => {
  const issues = validateRegisteredAutomationNode(node({
    ...validPolicy,
    warningEnabled: false,
    secondWarningEnabled: true,
  }));

  assert.ok(issues.some((issue) => issue.includes("bật cảnh báo lần một")));
});

test("rejects a malformed second-warning flag even when the first warning is disabled", () => {
  const malformed = node({ ...validPolicy, warningEnabled: false, secondWarningEnabled: false });
  malformed.data.reassignmentPolicy = {
    ...malformed.data.reassignmentPolicy,
    secondWarningEnabled: "yes",
  } as unknown as AutomationReassignmentPolicy;

  assert.ok(validateRegisteredAutomationNode(malformed).some((issue) => issue.includes("trạng thái cảnh báo lần hai")));
});

test("ignores dormant policy values while the feature is disabled", () => {
  assert.deepEqual(validateRegisteredAutomationNode(node({
    ...validPolicy,
    enabled: false,
    timeoutMinutes: 0,
    warningContent: "",
  })), []);
});

test("reports malformed JSON policy without throwing", () => {
  const malformed = node(validPolicy);
  malformed.data.reassignmentPolicy = {
    enabled: true,
    interactionCriterion: "not_opened_since_assignment",
    timeoutMinutes: "60",
    warningEnabled: true,
  } as unknown as AutomationReassignmentPolicy;

  assert.doesNotThrow(() => validateRegisteredAutomationNode(malformed));
  const issues = validateRegisteredAutomationNode(malformed);
  assert.ok(issues.some((issue) => issue.includes("thời gian chờ")));
  assert.ok(issues.some((issue) => issue.includes("nội dung cảnh báo")));
});
