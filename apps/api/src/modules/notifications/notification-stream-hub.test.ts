import assert from "node:assert/strict";
import { test } from "node:test";
import { createNotificationStreamHub } from "./notification-stream-hub";

test("signals reach only the recipient's streams", () => {
  const hub = createNotificationStreamHub(5);
  const received: string[] = [];
  hub.subscribe("user-a", () => received.push("a1"));
  hub.subscribe("user-a", () => received.push("a2"));
  hub.subscribe("user-b", () => received.push("b1"));
  hub.publish("user-a");
  hub.publish("user-unknown");
  assert.deepEqual(received, ["a1", "a2"]);
});

test("unsubscribed streams stop receiving and free their slot", () => {
  const hub = createNotificationStreamHub(1);
  let count = 0;
  const unsubscribe = hub.subscribe("user-a", () => { count += 1; });
  assert.ok(unsubscribe);
  assert.equal(hub.subscribe("user-a", () => undefined), null);
  unsubscribe();
  hub.publish("user-a");
  assert.equal(count, 0);
  assert.equal(hub.streamCount(), 0);
  assert.ok(hub.subscribe("user-a", () => undefined));
});

test("publishAll reaches every open stream", () => {
  const hub = createNotificationStreamHub(5);
  const received: string[] = [];
  hub.subscribe("user-a", () => received.push("a"));
  hub.subscribe("user-b", () => received.push("b"));
  hub.publishAll();
  assert.deepEqual(received.sort(), ["a", "b"]);
});
