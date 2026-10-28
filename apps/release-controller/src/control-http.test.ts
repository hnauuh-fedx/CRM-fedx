import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
Object.assign(process.env, {
  CONTROL_DATABASE_URL: "postgresql://test:test@localhost:1/control",
  CONTROL_API_TOKEN: "a".repeat(32), CONTROL_CI_TOKEN: "b".repeat(32), CONTROL_RECOVERY_TOKEN: "c".repeat(32),
  CONTROL_IMAGE_PREFIX: "ghcr.io/org/crm/", CONTROL_SCHEMA_GENERATION: "g1",
  CONTROL_STAGING_DIRECTORY: "/srv/crm/staging", CONTROL_PRODUCTION_DIRECTORY: "/srv/crm/production",
});
test("controller separates API, CI and recovery credentials and rejects malformed requests", async () => {
  const { createControlApp, tokenMatches } = await import("./server.js");
  assert.equal(tokenMatches(undefined, "a".repeat(32)), false);
  assert.equal(tokenMatches(`Bearer ${"a".repeat(32)}`, "a".repeat(32)), true);
  const server = createControlApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const [route, token] of [["/v1/releases", "a"], ["/v1/deployments", "b"], ["/v1/recovery/reconcile", "a"]]) {
      const response = await fetch(base + route, { method: "POST", headers: { Authorization: `Bearer ${token.repeat(32)}`, "Content-Type": "application/json" }, body: "{}" });
      assert.equal(response.status, 401);
    }
    const bad = await fetch(base + "/v1/releases", { method: "POST", headers: { Authorization: `Bearer ${"b".repeat(32)}`, "Content-Type": "application/json" }, body: JSON.stringify({ command: "unsafe" }) });
    assert.equal(bad.status, 400);
    const invalidPage = await fetch(base + "/v1/releases?page=-1", { headers: { Authorization: `Bearer ${"a".repeat(32)}` } });
    assert.equal(invalidPage.status, 400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
