import assert from "node:assert/strict";
import { test } from "node:test";
import { failedJobRetention } from "./queue-retention";

test("failed-job retention stays unchanged locally and is bounded only when selected", () => {
  assert.equal(failedJobRetention(false, 0), false);
  assert.equal(failedJobRetention(5000, 0), 5000);
  assert.deepEqual(failedJobRetention(false, 1000), { count: 1000 });
});
