import assert from "node:assert/strict";
import test from "node:test";

import {
  canRetryAdmissionExpiryExecution,
  formatAdmissionExpiryDate,
  getAdmissionExpiryExecutionId,
  getAdmissionExpiryTargetDate,
} from "./automation-admission-expiry";

test("admission expiry target follows the Vietnam calendar day", () => {
  const beforeMidnightUtc = getAdmissionExpiryTargetDate(new Date("2026-10-05T16:30:00.000Z"), 2);
  const afterMidnightVietnam = getAdmissionExpiryTargetDate(new Date("2026-10-05T17:30:00.000Z"), 2);

  assert.equal(formatAdmissionExpiryDate(beforeMidnightUtc), "2026-10-07");
  assert.equal(formatAdmissionExpiryDate(afterMidnightVietnam), "2026-10-08");
});

test("admission expiry execution id is stable per rule, profile and target date", () => {
  const targetDate = new Date("2026-10-10T00:00:00.000Z");
  const first = getAdmissionExpiryExecutionId("rule-1", "profile-1", targetDate);

  assert.equal(first, getAdmissionExpiryExecutionId("rule-1", "profile-1", targetDate));
  assert.notEqual(first, getAdmissionExpiryExecutionId("rule-1", "profile-2", targetDate));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("only enqueue failures without a started node are eligible for automatic retry", () => {
  assert.equal(canRetryAdmissionExpiryExecution(null), false);
  assert.equal(canRetryAdmissionExpiryExecution({ status: "failed", nodeExecutionCount: 0 }), true);
  assert.equal(canRetryAdmissionExpiryExecution({ status: "failed", nodeExecutionCount: 1 }), false);
  assert.equal(canRetryAdmissionExpiryExecution({ status: "completed", nodeExecutionCount: 0 }), false);
});
