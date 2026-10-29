import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test", CONTROL_DEPLOYMENT_MODE: "prepare-only", CONTROL_DATABASE_URL: "postgresql://fixture@127.0.0.1:1/unused",
  CONTROL_API_TOKEN: "a".repeat(32), CONTROL_CI_TOKEN: "b".repeat(32), CONTROL_RECOVERY_TOKEN: "c".repeat(32),
  CONTROL_IMAGE_PREFIX: "ghcr.io/test/crm/", CONTROL_SCHEMA_GENERATION: "g1",
  CONTROL_STAGING_DIRECTORY: "/unused/staging", CONTROL_PRODUCTION_DIRECTORY: "/unused/production",
});

test("prepare-only rejects deployment and recovery before database or provider access", async () => {
  const { createControlApp } = await import("./server.js");
  const { pool } = await import("./store.js");
  const server = createControlApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const body = { deployment: { releaseId: "11111111-1111-4111-8111-111111111111", requestId: "22222222-2222-4222-8222-222222222222", environment: "staging", operation: "deploy", reason: "Fixture preparation" }, actor: { id: "33333333-3333-4333-8333-333333333333", name: "Fixture" } };
  try {
    for (const [route, token] of [["deployments", "a"], ["recovery/deployments", "c"]]) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/v1/${route}`, { method: "POST", headers: { Authorization: `Bearer ${token.repeat(32)}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(response.status, 409); assert.match((await response.json()).message, /chuẩn bị/);
    }
    assert.equal(pool.totalCount, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); }
});
