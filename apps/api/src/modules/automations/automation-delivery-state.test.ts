import assert from "node:assert/strict";
import test from "node:test";

import { claimAutomationDelivery, classifyAutomationDeliveryHttpStatus } from "./automation-delivery-state.service";

test("delivery status classification retries only temporary provider failures", () => {
  assert.equal(classifyAutomationDeliveryHttpStatus(202), "success");
  assert.equal(classifyAutomationDeliveryHttpStatus(400), "unrecoverable");
  assert.equal(classifyAutomationDeliveryHttpStatus(403), "unrecoverable");
  assert.equal(classifyAutomationDeliveryHttpStatus(408), "transient");
  assert.equal(classifyAutomationDeliveryHttpStatus(429), "transient");
  assert.equal(classifyAutomationDeliveryHttpStatus(503), "transient");
});

test("delivery claim is exclusive and a stale lease can be reclaimed with a new fencing token", async () => {
  const state = { status: "pending", updatedAt: new Date(0), attemptCount: 0 };
  const store = {
    async updateManyAndReturn(args: any) {
      const staleBefore = args.where.OR[1].updated_at.lt as Date;
      const claimable = ["pending", "failed"].includes(state.status) || (state.status === "sending" && state.updatedAt < staleBefore);
      if (!claimable) return [];
      state.status = "sending";
      state.updatedAt = args.data.updated_at;
      state.attemptCount += 1;
      return [{ attempt_count: state.attemptCount }];
    },
    async findUnique() { return { status: state.status }; },
  };
  const now = new Date("2026-10-05T01:00:00.000Z");
  const first = await claimAutomationDelivery("delivery-1", now, store);
  const concurrent = await claimAutomationDelivery("delivery-1", now, store);
  const reclaimed = await claimAutomationDelivery("delivery-1", new Date(now.getTime() + 120_001), store);
  assert.deepEqual(first, { claimed: true, status: "sending", attemptCount: 1 });
  assert.deepEqual(concurrent, { claimed: false, status: "sending" });
  assert.deepEqual(reclaimed, { claimed: true, status: "sending", attemptCount: 2 });
});
