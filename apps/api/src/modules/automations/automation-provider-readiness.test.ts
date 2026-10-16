import assert from "node:assert/strict";
import test from "node:test";
import { isAutomationProviderConfigured } from "./automation-provider-readiness";

test("provider remains disabled without credentials or with a local mock outside integration", () => {
  assert.equal(isAutomationProviderConfigured(undefined, undefined), false);
  assert.equal(isAutomationProviderConfigured("https://provider.example.test", undefined), false);
  assert.equal(isAutomationProviderConfigured("http://localhost:9000", "fixture"), false);
  assert.equal(isAutomationProviderConfigured("https://localhost:9000", "fixture"), false);
  assert.equal(isAutomationProviderConfigured("http://provider.example.test", "token"), false);
  assert.equal(isAutomationProviderConfigured("https://user:password@provider.example.test", "token"), false);
  assert.equal(isAutomationProviderConfigured("https://provider.example.test", "token"), true);
  assert.equal(isAutomationProviderConfigured("http://localhost:9000", "fixture", true), true);
});
