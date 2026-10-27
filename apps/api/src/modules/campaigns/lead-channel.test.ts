import assert from "node:assert/strict";
import test from "node:test";

import { formatLeadChannelName, leadChannelInputSchema, normalizeLeadChannelName } from "@admission-crm/shared/lead-channel";

test("inbound Nguồn names match list values regardless of case and spacing", () => {
  assert.equal(normalizeLeadChannelName("  Test   Source Ladipage "), "test source ladipage");
  assert.equal(normalizeLeadChannelName("TikTok"), normalizeLeadChannelName("tiktok"));
});

test("auto-created Nguồn values are shown with a trailing *", () => {
  assert.equal(formatLeadChannelName({ name: "test source ladipage", isAutoCreated: true }), "test source ladipage*");
  assert.equal(formatLeadChannelName({ name: "Facebook Ads", isAutoCreated: false }), "Facebook Ads");
});

test("Nguồn input requires a trimmed name", () => {
  assert.equal(leadChannelInputSchema.safeParse({ name: "   " }).success, false);
  assert.deepEqual(leadChannelInputSchema.parse({ name: "  Landing page  " }), { name: "Landing page" });
  assert.equal(leadChannelInputSchema.safeParse({ name: "A", isActive: true }).success, false);
});
