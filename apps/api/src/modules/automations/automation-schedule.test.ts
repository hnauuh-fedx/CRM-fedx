import assert from "node:assert/strict";
import test from "node:test";

import { findLatestDueScheduleMinute, getScheduleMinute, isAutomationScheduleDue, isValidAutomationSchedule } from "./automation-schedule";

test("schedule matches local timezone, weekday, and minute", () => {
  const date = new Date("2026-10-05T01:30:42.000Z");
  assert.equal(isAutomationScheduleDue(date, { timezone: "Asia/Ho_Chi_Minh", time: "08:30", days: ["1"] }), true);
  assert.equal(getScheduleMinute(date).toISOString(), "2026-10-05T01:30:00.000Z");
});

test("scheduler catches up a missed minute within its recovery window", () => {
  const schedule = { timezone: "Asia/Ho_Chi_Minh", time: "08:30", days: ["1"] };
  assert.equal(findLatestDueScheduleMinute(new Date("2026-10-05T01:42:00.000Z"), schedule)?.toISOString(), "2026-10-05T01:30:00.000Z");
  assert.equal(findLatestDueScheduleMinute(new Date("2026-10-05T01:46:00.000Z"), schedule), null);
});

test("schedule skips excluded dates and invalid configuration", () => {
  const date = new Date("2026-10-05T01:30:00.000Z");
  assert.equal(isAutomationScheduleDue(date, { timezone: "Asia/Ho_Chi_Minh", time: "08:30", days: ["1"], excludedDates: "2026-10-05" }), false);
  assert.equal(isAutomationScheduleDue(date, { timezone: "Invalid/Zone", time: "08:30", days: ["1"] }), false);
  assert.equal(isAutomationScheduleDue(date, { timezone: "UTC", time: "25:00", days: ["1"] }), false);
  assert.equal(isValidAutomationSchedule({ timezone: "UTC", time: "08:30", days: ["7"] }), false);
  assert.equal(isValidAutomationSchedule({ timezone: "UTC", time: "08:30", days: ["1"], excludedDates: "05/10/2026" }), false);
});
