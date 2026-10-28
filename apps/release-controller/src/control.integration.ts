// Uses a generated, empty local database only. Never migrates the CRM database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { config as loadDotenv } from "dotenv";

async function main() {
  loadDotenv({ path: path.join(__dirname, "../../api/.env"), quiet: true });
  const target = new URL(process.env.CONTROL_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("Integration tests require local PostgreSQL.");
  const name = `crm_release_test_${Date.now()}`;
  const adminUrl = new URL(target); adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect(); await admin.query(`CREATE DATABASE "${name}"`);
  target.pathname = `/${name}`;
  Object.assign(process.env, { NODE_ENV: "test", CONTROL_DATABASE_URL: target.toString(), CONTROL_API_TOKEN: "a".repeat(32), CONTROL_CI_TOKEN: "b".repeat(32), CONTROL_RECOVERY_TOKEN: "c".repeat(32), CONTROL_IMAGE_PREFIX: "ghcr.io/org/crm/", CONTROL_SCHEMA_GENERATION: "g1", CONTROL_STAGING_DIRECTORY: "/srv/staging", CONTROL_PRODUCTION_DIRECTORY: "/srv/production" });
  const { pool, registerRelease, enqueueDeployment } = await import("./store.js");
  const { startRunner } = await import("./runner.js");
  let stop: (() => Promise<void>) | undefined;
  try {
    await pool.query(await readFile(path.join(__dirname, "../schema.sql"), "utf8"));
    await pool.query("INSERT INTO environments(name,schema_generation) VALUES('staging','g1'),('production','g1')");
    const base = { commit: "a".repeat(40), version: "v1", notes: "", apiImage: `ghcr.io/org/crm/api@sha256:${"a".repeat(64)}`, webImage: `ghcr.io/org/crm/web@sha256:${"b".repeat(64)}`, schemaGeneration: "g1", buildUrl: "https://github.com/org/crm/actions/runs/1" };
    const v1 = await registerRelease(base);
    assert.equal((await registerRelease(base)).id, v1.id);
    await assert.rejects(registerRelease({ ...base, version: "mutated" }));
    await assert.rejects(registerRelease({ ...base, apiImage: `evil.io/api@sha256:${"a".repeat(64)}` }));
    const actor = { id: randomUUID(), name: "Người kiểm thử" };
    const request = { releaseId: v1.id, environment: "staging" as const, operation: "deploy" as const, requestId: randomUUID(), reason: "Kiểm tra phiên bản" };
    await assert.rejects(enqueueDeployment({ ...request, environment: "production" }, actor));
    const [first, repeated] = await Promise.all([enqueueDeployment(request, actor), enqueueDeployment(request, actor)]);
    assert.equal(first.id, repeated.id);
    await assert.rejects(enqueueDeployment({ ...request, requestId: randomUUID() }, actor));
    await assert.rejects(enqueueDeployment({ ...request, reason: "Lý do khác" }, actor));
    const waitFor = async (id: string, status: string) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const row = (await pool.query("SELECT * FROM deployments WHERE id=$1", [id])).rows[0];
        if (row.status === status) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error(`Deployment did not reach ${status}`);
    };
    stop = await startRunner(async () => {}, 10);
    await waitFor(first.id, "SUCCEEDED");
    const prod = await enqueueDeployment({ ...request, environment: "production", requestId: randomUUID() }, actor);
    await waitFor(prod.id, "SUCCEEDED");
    await stop(); stop = undefined;
    const v2 = await registerRelease({ ...base, commit: "b".repeat(40), version: "v2" });
    const next = await enqueueDeployment({ ...request, releaseId: v2.id, requestId: randomUUID() }, actor);
    stop = await startRunner(async () => { throw new Error("simulated uncertain docker failure"); }, 10);
    await waitFor(next.id, "NEEDS_REVIEW"); await stop(); stop = undefined;
    const state = (await pool.query("SELECT * FROM environments WHERE name='staging'")).rows[0];
    assert.equal(state.blocked, true); assert.equal(state.current_release_id, v1.id);
    await assert.rejects(enqueueDeployment({ ...request, releaseId: v2.id, requestId: randomUUID() }, actor));
    // Explicitly reconcile the isolated fixture and verify a compatible rollback is permitted.
    await pool.query("UPDATE environments SET blocked=false,current_release_id=$1 WHERE name='staging'", [v2.id]);
    const rollback = await enqueueDeployment({ ...request, operation: "rollback", requestId: randomUUID() }, actor);
    await pool.query("UPDATE deployments SET status='RUNNING' WHERE id=$1", [rollback.id]);
    stop = await startRunner(async () => {}, 10);
    assert.equal((await pool.query("SELECT status FROM deployments WHERE id=$1", [rollback.id])).rows[0].status, "NEEDS_REVIEW");
    assert.equal((await pool.query("SELECT blocked FROM environments WHERE name='staging'")).rows[0].blocked, true);
    await stop(); stop = undefined;
    const incompatible = await registerRelease({ ...base, commit: "c".repeat(40), schemaGeneration: "g2" });
    await assert.rejects(enqueueDeployment({ ...request, releaseId: incompatible.id, environment: "production", requestId: randomUUID() }, actor));
    console.log("PASS: immutable registration, registry allowlist, idempotency, concurrent requests, staging gate, successful promotion, failure blocking, rollback and restart recovery.");
  } finally {
    await stop?.(); await pool.end();
    if (!/^crm_release_test_\d+$/.test(name) || target.pathname !== `/${name}`) throw new Error("Unsafe cleanup target");
    await admin.query(`DROP DATABASE "${name}"`); await admin.end();
  }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
