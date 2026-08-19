import assert from "node:assert/strict";
import test from "node:test";

import { decideNodeExecution } from "./automation-execution-state";

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
