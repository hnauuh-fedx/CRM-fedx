import assert from "node:assert/strict";
import { test } from "node:test";
import { installWorkerShutdown } from "./worker-shutdown";

test("shutdown waits for active work before closing resources and runs only once", async () => {
  const events: string[] = [];
  let finish!: () => void;
  const active = new Promise<void>(resolve => { finish = resolve; });
  const shutdown = installWorkerShutdown({ name: "fixture", drain: async () => { events.push("drain"); await active; }, close: async () => { events.push("close"); }, exit: code => events.push(`exit:${code}`) });
  const first = shutdown("test"); const second = shutdown("repeat");
  assert.equal(first, second); assert.deepEqual(events, ["drain"]);
  finish(); await first;
  assert.deepEqual(events, ["drain", "close", "exit:0"]);
});
