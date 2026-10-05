import assert from "node:assert/strict";
import test from "node:test";

import { getSuppressionReason, hashDestination, maskDestination, normalizeDestination } from "./automation-channel-policy";

test("normalizes and masks destinations without exposing the full value", () => {
  assert.equal(normalizeDestination("email", " Test@Example.COM "), "test@example.com");
  assert.equal(maskDestination("email", "test@example.com"), "te***@example.com");
  assert.equal(normalizeDestination("sms", "090 123-4567"), "0901234567");
  assert.equal(maskDestination("sms", "0901234567"), "******4567");
  assert.equal(hashDestination("sms", "090 123-4567"), hashDestination("sms", "0901234567"));
});

test("blocks suppression and opt-out before evaluating relaxed consent", () => {
  assert.equal(getSuppressionReason({ consentStatus: "consented", consentPolicy: "allow_unknown", isSuppressed: true }), "suppression_list");
  assert.equal(getSuppressionReason({ consentStatus: "opted_out", consentPolicy: "allow_unknown", isSuppressed: false }), "opted_out");
  assert.equal(getSuppressionReason({ consentStatus: "unknown", consentPolicy: "require_consent", isSuppressed: false }), "consent_required");
  assert.equal(getSuppressionReason({ consentStatus: "unknown", consentPolicy: "allow_unknown", isSuppressed: false }), null);
});
