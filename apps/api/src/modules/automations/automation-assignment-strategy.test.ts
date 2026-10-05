import assert from "node:assert/strict";
import test from "node:test";

import { selectLeastLoadedAssignee, selectRoundRobinAssignee } from "./automation-assignment-strategy";

test("round-robin advances after the persisted cursor and wraps", () => {
  const candidates = ["sale-a", "sale-b", "sale-c"];

  assert.equal(selectRoundRobinAssignee(candidates, "sale-a"), "sale-b");
  assert.equal(selectRoundRobinAssignee(candidates, "sale-c"), "sale-a");
  assert.equal(selectRoundRobinAssignee(candidates, "removed-user"), "sale-a");
});

test("least-loaded picks the smallest active load with candidate order as deterministic tie-break", () => {
  const candidates = [
    { id: "sale-a", activeLeadCount: 4 },
    { id: "sale-b", activeLeadCount: 2 },
    { id: "sale-c", activeLeadCount: 2 },
  ];

  assert.equal(selectLeastLoadedAssignee(candidates), "sale-b");
});

test("assignment strategies reject an empty candidate pool", () => {
  assert.throws(() => selectRoundRobinAssignee([], null), /ít nhất một nhân viên/i);
  assert.throws(() => selectLeastLoadedAssignee([]), /ít nhất một nhân viên/i);
});
