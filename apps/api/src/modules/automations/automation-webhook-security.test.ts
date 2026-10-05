import assert from "node:assert/strict";
import test from "node:test";

import { assertAutomationWebhookPayloadSize, isPrivateNetworkAddress, validateAutomationWebhookTarget } from "./automation-webhook-security";

test("webhook target requires HTTPS and an exact allowlisted public hostname", () => {
  assert.equal(validateAutomationWebhookTarget("https://hooks.example.com/crm", ["hooks.example.com"]).ok, true);
  assert.equal(validateAutomationWebhookTarget("http://hooks.example.com/crm", ["hooks.example.com"]).ok, false);
  assert.equal(validateAutomationWebhookTarget("https://evil.example.com", ["hooks.example.com"]).ok, false);
  assert.equal(validateAutomationWebhookTarget("https://127.0.0.1/hook", ["127.0.0.1"]).ok, false);
  assert.equal(validateAutomationWebhookTarget("https://localhost/hook", ["localhost"]).ok, false);
});

test("webhook payload is limited to 32 KB", () => {
  assert.doesNotThrow(() => assertAutomationWebhookPayloadSize("x".repeat(32 * 1024)));
  assert.throws(() => assertAutomationWebhookPayloadSize("x".repeat(32 * 1024 + 1)), /32 KB/);
});

test("private, loopback, link-local and reserved DNS results are rejected", () => {
  for (const address of ["10.0.0.1", "127.0.0.1", "169.254.1.1", "172.20.1.1", "192.168.1.1", "100.64.1.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateNetworkAddress(address), true, address);
  }
  assert.equal(isPrivateNetworkAddress("8.8.8.8"), false);
  assert.equal(isPrivateNetworkAddress("2606:4700:4700::1111"), false);
});
