import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReassignmentSchedule,
  planReassignmentCandidates,
} from "./automation-reassignment-state.js";

test("keeps only untried candidates and always excludes the current sale", () => {
  assert.deepEqual(planReassignmentCandidates({
    eligibleIds: ["sale-a", "sale-b", "sale-c"],
    currentAssigneeId: "sale-a",
    attemptedAssigneeIds: ["sale-a", "sale-b"],
    recyclePool: false,
    poolCycle: 0,
    maxPoolCycles: 1,
  }), {
    candidateIds: ["sale-c"],
    attemptedAssigneeIds: ["sale-a", "sale-b"],
    poolCycle: 0,
    recycled: false,
  });
});

test("stops when every candidate was tried and recycling is disabled", () => {
  assert.deepEqual(planReassignmentCandidates({
    eligibleIds: ["sale-a", "sale-b"],
    currentAssigneeId: "sale-b",
    attemptedAssigneeIds: ["sale-a", "sale-b"],
    recyclePool: false,
    poolCycle: 0,
    maxPoolCycles: 1,
  }), { stopReason: "candidate_pool_exhausted" });
});

test("recycles once while still excluding the current sale", () => {
  assert.deepEqual(planReassignmentCandidates({
    eligibleIds: ["sale-a", "sale-b", "sale-c"],
    currentAssigneeId: "sale-c",
    attemptedAssigneeIds: ["sale-a", "sale-b", "sale-c"],
    recyclePool: true,
    poolCycle: 0,
    maxPoolCycles: 1,
  }), {
    candidateIds: ["sale-a", "sale-b"],
    attemptedAssigneeIds: ["sale-c"],
    poolCycle: 1,
    recycled: true,
  });
});

test("stops after reaching the configured recycle limit", () => {
  assert.deepEqual(planReassignmentCandidates({
    eligibleIds: ["sale-a", "sale-b"],
    currentAssigneeId: "sale-b",
    attemptedAssigneeIds: ["sale-a", "sale-b"],
    recyclePool: true,
    poolCycle: 1,
    maxPoolCycles: 1,
  }), { stopReason: "pool_cycle_limit_reached" });
});

test("derives warning and reassignment deadlines from the assignment time", () => {
  const assignedAt = new Date("2026-10-08T01:00:00.000Z");
  assert.deepEqual(buildReassignmentSchedule(assignedAt, {
    timeoutMinutes: 60,
    warningEnabled: true,
    warningBeforeMinutes: 30,
  }), {
    warningDueAt: new Date("2026-10-08T01:30:00.000Z"),
    reassignmentDueAt: new Date("2026-10-08T02:00:00.000Z"),
  });
  assert.equal(buildReassignmentSchedule(assignedAt, {
    timeoutMinutes: 60,
    warningEnabled: false,
    warningBeforeMinutes: 30,
  }).warningDueAt, null);
});
