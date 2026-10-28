import assert from "node:assert/strict";
import { test } from "node:test";
import { storeIntegrationMessage } from "./integration-message-store";

test("concurrent provider event insertion returns the existing durable message", async () => {
  assert.deepEqual(await storeIntegrationMessage(async () => { throw { code: "P2002" }; }, async () => ({ id: "existing" })), { id: "existing" });
  await assert.rejects(storeIntegrationMessage(async () => { throw new Error("database down"); }, async () => ({ id: "must not acknowledge" })));
});
