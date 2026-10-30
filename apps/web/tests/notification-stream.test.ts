import assert from "node:assert/strict";
import test from "node:test";
import { createSseParser, notificationStreamRetryDelay, type NotificationStreamEvent } from "../src/modules/notifications/notification-stream";

test("sse parser emits named events across chunk boundaries and skips heartbeats", () => {
  const events: NotificationStreamEvent[] = [];
  const parse = createSseParser((event) => events.push(event));
  parse("retry: 5000\nevent: ready\ndata: {}\n\n: ping\n\nevent: notif");
  parse("ications\r\ndata: {}\r\n\r\n");
  assert.deepEqual(events, [{ event: "ready", data: "{}" }, { event: "notifications", data: "{}" }]);
});

test("sse parser ignores blocks without data", () => {
  const events: NotificationStreamEvent[] = [];
  const parse = createSseParser((event) => events.push(event));
  parse("retry: 5000\n\n: ping\n\n");
  assert.deepEqual(events, []);
});

test("reconnect delay grows, caps at 30 seconds and keeps jitter within 25%", () => {
  assert.equal(notificationStreamRetryDelay(0, () => 0.5), 1000);
  assert.equal(notificationStreamRetryDelay(2, () => 0.5), 5000);
  assert.equal(notificationStreamRetryDelay(99, () => 0.5), 30000);
  assert.equal(notificationStreamRetryDelay(0, () => 0), 750);
  assert.equal(notificationStreamRetryDelay(0, () => 1), 1250);
});
