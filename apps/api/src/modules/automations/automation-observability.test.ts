import assert from "node:assert/strict";
import test from "node:test";

import {
  automationExecutionStatusWhere,
  classifyAutomationExecution,
  compareAutomationVersions,
  createReplayExecutionId,
  redactAutomationText,
  redactAutomationValue,
  selectRecoverableNodeIds,
} from "./automation-observability";

test("classifies old processing executions as stuck", () => {
  const now = new Date("2026-10-06T10:00:00.000Z");

  assert.equal(
    classifyAutomationExecution({
      status: "processing",
      lastProgressAt: new Date("2026-10-06T09:20:00.000Z"),
      completedAt: null,
      nextRunAt: null,
      now,
      stuckAfterMinutes: 30,
    }),
    "stuck",
  );
  assert.equal(
    classifyAutomationExecution({
      status: "processing",
      lastProgressAt: new Date("2026-10-06T09:45:00.000Z"),
      completedAt: null,
      nextRunAt: null,
      now,
      stuckAfterMinutes: 30,
    }),
    "processing",
  );
});

test("does not classify an intentional future delay as stuck", () => {
  assert.equal(classifyAutomationExecution({
    status: "processing",
    lastProgressAt: new Date("2026-10-06T08:00:00.000Z"),
    completedAt: null,
    nextRunAt: new Date("2026-10-07T08:00:00.000Z"),
    now: new Date("2026-10-06T10:00:00.000Z"),
    stuckAfterMinutes: 30,
  }), "processing");
});

test("processing filter excludes the exact derived-stuck predicate", () => {
  const now = new Date("2026-10-06T10:00:00.000Z");
  const stuckBefore = new Date("2026-10-06T09:30:00.000Z");
  const stuckPredicate = {
    completed_at: null,
    AND: [
      {
        OR: [
          { last_progress_at: { lte: stuckBefore } },
          { last_progress_at: null, started_at: { lte: stuckBefore } },
        ],
      },
      { OR: [{ next_run_at: null }, { next_run_at: { lte: now } }] },
    ],
  };

  assert.deepEqual(automationExecutionStatusWhere("stuck", now, 30), {
    status: "processing",
    ...stuckPredicate,
  });
  assert.deepEqual(automationExecutionStatusWhere("processing", now, 30), {
    status: "processing",
    NOT: stuckPredicate,
  });
});

test("redacts sensitive values recursively without removing business identifiers", () => {
  assert.deepEqual(
    redactAutomationValue({
      leadId: "lead-1",
      email: "student@example.com",
      profile: { phoneNumber: "0900000000", name: "Nguyen Van A" },
      headers: { authorization: "Bearer secret" },
    }),
    {
      leadId: "lead-1",
      email: "[REDACTED]",
      profile: { phoneNumber: "[REDACTED]", name: "Nguyen Van A" },
      headers: { authorization: "[REDACTED]" },
    },
  );
});

test("redacts email, Vietnamese phone number, CCCD, and bearer token from provider errors", () => {
  assert.equal(
    redactAutomationText("Failed for student@example.com / 0901234567 / 012345678901 with Bearer abc.def-123"),
    "Failed for [REDACTED_EMAIL] / [REDACTED_PHONE] / [REDACTED_ID] with Bearer [REDACTED_TOKEN]",
  );
});

test("selects failed nodes first and falls back to unfinished entry nodes", () => {
  assert.deepEqual(
    selectRecoverableNodeIds(
      [
        { nodeId: "send-email", status: "failed" },
        { nodeId: "update-lead", status: "completed" },
      ],
      ["send-email", "assign-owner"],
    ),
    ["send-email"],
  );
  assert.deepEqual(selectRecoverableNodeIds([], ["assign-owner"]), ["assign-owner"]);
});

test("recovers a deep processing node and a lost downstream enqueue frontier", () => {
  assert.deepEqual(selectRecoverableNodeIds([
    { nodeId: "entry", status: "completed" },
    { nodeId: "deep-action", status: "processing" },
  ], ["entry"], [{ source: "entry", target: "deep-action" }]), ["deep-action"]);
  assert.deepEqual(selectRecoverableNodeIds([
    { nodeId: "entry", status: "completed" },
    { nodeId: "deep-action", status: "completed" },
  ], ["entry"], [
    { source: "entry", target: "deep-action" },
    { source: "deep-action", target: "next-node" },
  ]), ["next-node"]);
});

test("recovers only the persisted branch of a completed condition", () => {
  assert.deepEqual(selectRecoverableNodeIds([
    { nodeId: "condition", status: "completed", nextSourceHandle: "false" },
  ], ["condition"], [
    { source: "condition", target: "true-node", sourceHandle: "default" },
    { source: "condition", target: "false-node", sourceHandle: "false" },
  ]), ["false-node"]);
});

test("summarizes nodes and edges changed between rule versions", () => {
  const before = {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      { id: "email", type: "send_email", position: { x: 1, y: 1 }, data: { subject: "A" } },
    ],
    edges: [{ id: "e1", source: "trigger", target: "email" }],
  };
  const after = {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      { id: "email", type: "send_email", position: { x: 2, y: 2 }, data: { subject: "B" } },
      { id: "tag", type: "add_tag", position: { x: 3, y: 3 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "email" },
      { id: "e2", source: "email", target: "tag" },
    ],
  };

  assert.deepEqual(compareAutomationVersions(before, after), {
    addedNodeIds: ["tag"],
    removedNodeIds: [],
    changedNodeIds: ["email"],
    addedEdgeIds: ["e2"],
    removedEdgeIds: [],
  });
});

test("derives a stable replay execution id from source and request", () => {
  const first = createReplayExecutionId("source-1", "request-1");
  assert.equal(first, createReplayExecutionId("source-1", "request-1"));
  assert.notEqual(first, createReplayExecutionId("source-1", "request-2"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
