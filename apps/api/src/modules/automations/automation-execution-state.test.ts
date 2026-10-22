import assert from "node:assert/strict";
import test from "node:test";

import { decideNodeExecution } from "./automation-execution-state";
import { selectRecoverableNodeIds } from "./automation-observability";

test("executes a node that has not recorded an action result", () => {
  assert.deepEqual(decideNodeExecution(null), { kind: "execute_action" });
  assert.deepEqual(decideNodeExecution({ status: "failed", nextSourceHandle: null, delayMinutes: 0 }), {
    kind: "execute_action",
  });
});

test("reuses the durable action result when retrying after enqueue failure", () => {
  assert.deepEqual(
    decideNodeExecution({ status: "action_completed", nextSourceHandle: "false", delayMinutes: 15 }),
    { kind: "reuse_action_result", nextSourceHandle: "false", delayMinutes: 15 },
  );
});

test("skips a node that already completed including downstream enqueue", () => {
  assert.deepEqual(
    decideNodeExecution({ status: "completed", nextSourceHandle: "default", delayMinutes: 0 }),
    { kind: "already_completed" },
  );
});

test("no-change checkpoints survive enqueue retry and skip already completed nodes", () => {
  assert.deepEqual(decideNodeExecution({ status: "action_completed_no_change", nextSourceHandle: "default", delayMinutes: 0 }), {
    kind: "reuse_action_result", nextSourceHandle: "default", delayMinutes: 0, noChange: true,
  });
  assert.deepEqual(decideNodeExecution({ status: "completed_no_change", nextSourceHandle: "default", delayMinutes: 0 }), { kind: "already_completed" });
  assert.deepEqual(selectRecoverableNodeIds([{ nodeId: "update", status: "action_completed_no_change" }], ["update"]), ["update"]);
  assert.deepEqual(selectRecoverableNodeIds([{ nodeId: "update", status: "completed_no_change", nextSourceHandle: "default" }], ["update"], [{ source: "update", target: "next" }]), ["next"]);
  assert.deepEqual(selectRecoverableNodeIds([{ nodeId: "update", status: "completed_no_change" }], ["update"]), []);
});
