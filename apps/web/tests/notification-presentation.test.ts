import assert from "node:assert/strict";
import test from "node:test";
import { formatCountdown, formatDurationText, getNotificationTone } from "../src/modules/notifications/notification-presentation";

test("countdown drops the hour part under one hour and keeps counting hours past a day", () => {
  assert.equal(formatCountdown(640_000), "10:40");
  assert.equal(formatCountdown(9_000), "0:09");
  assert.equal(formatCountdown(3_920_000), "1:05:20");
  assert.equal(formatCountdown(26 * 3_600_000 + 5 * 60_000), "26:05:00");
  assert.equal(formatCountdown(-5_000), "0:00");
});

test("first-warning duration reads as minutes or hours and minutes", () => {
  assert.equal(formatDurationText(25 * 60_000 + 30_000), "25 phút");
  assert.equal(formatDurationText(80 * 60_000), "1 giờ 20 phút");
  assert.equal(formatDurationText(120 * 60_000), "2 giờ");
  assert.equal(formatDurationText(20_000), "dưới 1 phút");
});

test("each notification type maps to one of four dot colours", () => {
  assert.equal(getNotificationTone("lead_assignment"), "assignment");
  assert.equal(getNotificationTone("automation_reassignment_warning"), "warning");
  assert.equal(getNotificationTone("automation_reassignment_second_warning"), "warning");
  assert.equal(getNotificationTone("automation_reassignment_removed"), "removed");
  assert.equal(getNotificationTone("reminder"), "other");
  assert.equal(getNotificationTone(null), "other");
});
