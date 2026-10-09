import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  getMetaMessagingEvents,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "./meta-webhook.service";

test("accepts a valid Meta webhook verification challenge", () => {
  const result = verifyMetaWebhookChallenge({
    "hub.mode": "subscribe",
    "hub.verify_token": "a-secure-webhook-token",
    "hub.challenge": "123456789",
  }, "a-secure-webhook-token");

  assert.equal(result, "123456789");
});

test("rejects an invalid Meta webhook verification token", () => {
  const result = verifyMetaWebhookChallenge({
    "hub.mode": "subscribe",
    "hub.verify_token": "wrong-token",
    "hub.challenge": "123456789",
  }, "a-secure-webhook-token");

  assert.equal(result, null);
});

test("verifies X-Hub-Signature-256 against the unmodified request body", () => {
  const rawBody = JSON.stringify({ object: "page", entry: [] });
  const secret = "meta-app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  assert.equal(verifyMetaWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyMetaWebhookSignature(`${rawBody} `, signature, secret), false);
});

test("extracts Messenger events only from Page webhook payloads", () => {
  const events = getMetaMessagingEvents({
    object: "page",
    entry: [{
      id: "page-1",
      time: 123,
      messaging: [{
        sender: { id: "psid-1" },
        recipient: { id: "page-1" },
        timestamp: 456,
        message: { mid: "m-1", text: "Xin chào" },
      }],
    }],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.pageId, "page-1");
  assert.equal(events[0]?.senderId, "psid-1");
  assert.equal(events[0]?.event.message?.mid, "m-1");
  assert.deepEqual(getMetaMessagingEvents({ object: "instagram", entry: [] }), []);
});
