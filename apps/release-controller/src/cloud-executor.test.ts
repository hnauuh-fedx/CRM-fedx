import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import * as tar from "tar";
import type { ReleaseRegistration } from "@admission-crm/shared/releases";
Object.assign(process.env, { NODE_ENV: "test", CONTROL_DATABASE_URL: "postgresql://fixture@127.0.0.1:1/unused", CONTROL_API_TOKEN: "a".repeat(32), CONTROL_CI_TOKEN: "b".repeat(32), CONTROL_RECOVERY_TOKEN: "c".repeat(32), CONTROL_IMAGE_PREFIX: "ghcr.io/test/crm/", CONTROL_SCHEMA_GENERATION: "g1", CONTROL_STAGING_DIRECTORY: "/unused/staging", CONTROL_PRODUCTION_DIRECTORY: "/unused/production" });

test("frontend extraction verifies checksum/commit and rejects symlinks or executable Pages functions", async () => {
  const { unpackCloudArtifact } = await import("./cloud-artifact.js");
  const root = await mkdtemp(path.join(tmpdir(), "crm-artifact-test-"));
  try {
    await writeFile(path.join(root, "index.html"), "fixture"); await writeFile(path.join(root, "version.json"), JSON.stringify({ commit: "a".repeat(40) }));
    const archive = path.join(root, "archive.tar.gz"); await tar.c({ cwd: root, gzip: true, file: archive }, ["index.html", "version.json"]);
    const bytes = await readFile(archive), sha = createHash("sha256").update(bytes).digest("hex");
    const unpacked = await unpackCloudArtifact(bytes, sha, bytes.length, "a".repeat(40)); await unpacked.close();
    await assert.rejects(unpackCloudArtifact(bytes, "b".repeat(64), bytes.length, "a".repeat(40)));
    await assert.rejects(unpackCloudArtifact(bytes, sha, bytes.length, "b".repeat(40)));
    await writeFile(path.join(root, "_worker.js"), "throw 'unsafe'"); await tar.c({ cwd: root, gzip: true, file: archive }, ["index.html", "version.json", "_worker.js"]);
    const unsafe = await readFile(archive); await assert.rejects(unpackCloudArtifact(unsafe, createHash("sha256").update(unsafe).digest("hex"), unsafe.length, "a".repeat(40)));
    for (const data of [{ path: "../escape", type: "File" as const, size: 0 }, { path: "link", type: "SymbolicLink" as const, linkpath: "../outside", size: 0 }]) {
      const header = new tar.Header(data); header.encode(); const unsafe = gzipSync(Buffer.concat([header.block!, Buffer.alloc(1024)]));
      await assert.rejects(unpackCloudArtifact(unsafe, createHash("sha256").update(unsafe).digest("hex"), unsafe.length, "a".repeat(40)));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function fixture(action: (context: { execute: () => Promise<void>; observe: () => Promise<void>; journal: Map<string, import("./cloud-executor").ComponentRecord>; state: { renderCalls: number; pagesCalls: number; failRender: boolean; failPages: boolean; drift: boolean; autoDeploy: boolean } }) => Promise<void>) {
  const { executeCloudRelease, observeCloudRelease } = await import("./cloud-executor.js");
  const { createProviderClient } = await import("./cloud-providers.js");
  const commit = "a".repeat(40), image = `ghcr.io/test/crm/api@sha256:${"b".repeat(64)}`;
  const state = { renderCalls: 0, pagesCalls: 0, failRender: false, failPages: false, drift: false, autoDeploy: false };
  const deployments = new Map<string, { id: string; status: string; image: { ref: string } }[]>();
  let pagesDeployment: any = { id: "old-pages", environment: "production", deployment_trigger: { metadata: { commit_hash: "0".repeat(40) } }, latest_stage: { status: "success" } };
  let origin = "";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    if (url.pathname === "/version.json") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ commit: state.drift ? "0".repeat(40) : commit, apiOrigin: origin, webOrigin: origin })); return; }
    assert.match(req.headers.authorization ?? "", /^Bearer fixture-/);
    let result: any;
    if (url.pathname.startsWith("/render/services/")) {
      const segments = url.pathname.split("/"); const id = segments[3];
      if (!deployments.has(id)) deployments.set(id, [{ id: `old-${id}`, status: "live", image: { ref: image.replace(/b/g, "c") } }]);
      const list = deployments.get(id)!;
      if (req.method === "POST") {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString()); assert.equal(body.imageUrl, image); state.renderCalls++;
        list.forEach(item => { item.status = "deactivated"; }); const created = { id: `dep-${id}`, status: "live", image: { ref: image } }; list.unshift(created);
        if (state.failRender) { req.socket.destroy(); return; } result = created;
      } else if (segments.length === 4) {
        const entries: Record<string, string> = { "srv-api": "api.ts", "srv-webhooks": "workers/webhook.worker.ts", "srv-automation": "workers/automation.worker.ts", "srv-integrations": "workers/integrations.worker.ts", "srv-reminders": "workers/reminders.worker.ts", "srv-monitor": "workers/operations-monitor.worker.ts" };
        result = { id, ownerId: "tea-fixture", autoDeployTrigger: state.autoDeploy ? "commit" : "off", imagePath: image, type: id === "srv-api" ? "web_service" : "background_worker", serviceDetails: { runtime: "image", envSpecificDetails: { dockerCommand: `node --import tsx apps/api/src/${entries[id]}` } } };
      }
      else if (segments.length === 5) result = list.map(deploy => ({ deploy }));
      else result = list.find(item => item.id === segments[5]);
    } else if (url.pathname.endsWith("/deployments")) result = [pagesDeployment];
    else result = { name: "crm-fixture", production_branch: "main", canonical_deployment: { id: pagesDeployment.id } };
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(url.pathname.startsWith("/pages/") ? { success: true, result } : result));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string"); origin = `http://127.0.0.1:${address.port}`;
  const topology = { environment: "staging" as const, schemaGeneration: "g1", publicApiOrigin: origin, publicWebOrigin: origin, renderOwnerId: "tea-fixture", pages: { accountId: "d".repeat(32), projectName: "crm-fixture", productionBranch: "main" }, render: { api: "srv-api", webhooks: "srv-webhooks", automation: "srv-automation", integrations: "srv-integrations", reminders: "srv-reminders", monitor: "srv-monitor" } };
  const artifact = { key: `releases/${commit}/staging/web-${"e".repeat(64)}.tar.gz`, sha256: "e".repeat(64), size: 1, apiOrigin: origin, webOrigin: origin };
  const manifest: ReleaseRegistration = { provider: "render-cloudflare", cloud: { staging: artifact, production: artifact }, commit, version: "fixture", notes: "", apiImage: image, webImage: image, schemaGeneration: "g1", buildUrl: "https://example.test/build" };
  const journal = new Map<string, import("./cloud-executor").ComponentRecord>();
  const dependencies: import("./cloud-executor").CloudDependencies = {
    client: createProviderClient({ renderToken: "fixture-render", pagesToken: "fixture-pages", renderOrigin: `${origin}/render/`, pagesOrigin: `${origin}/pages/`, allowLoopback: true }),
    journal: { async load(component) { return structuredClone(journal.get(component) ?? null); }, async save(record) { journal.set(record.component, structuredClone(record)); } },
    artifact: async () => ({ directory: "/unused", close: async () => {} }),
    publish: async (_directory, options) => { state.pagesCalls++; if (state.failPages) throw new Error("Fixture Pages failure"); pagesDeployment = { id: "new-pages", environment: "production", deployment_trigger: { metadata: { commit_hash: commit, commit_message: `crm-intent:${options.intentId}` } }, latest_stage: { status: "success" } }; },
    verify: async () => {}, token: "fixture-pages", timeoutMs: 3000, pollMs: 1,
  };
  try { await action({ execute: () => executeCloudRelease(topology, manifest, async () => {}, dependencies), observe: () => observeCloudRelease(topology, manifest, dependencies), journal, state }); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test("cloud executor verifies all seven components and detects frontend drift", async () => fixture(async ({ execute, observe, journal, state }) => {
  await execute(); assert.equal(state.renderCalls, 6); assert.equal(state.pagesCalls, 1); assert.equal(journal.size, 7); assert.ok([...journal.values()].every(item => item.status === "VERIFIED"));
  await observe(); state.drift = true; await assert.rejects(observe());
}));
test("cloud preflight rejects auto-deploy before any provider mutation", async () => fixture(async ({ execute, journal, state }) => {
  state.autoDeploy = true;
  await assert.rejects(execute(), /auto-deploy policy mismatch/);
  assert.equal(state.renderCalls, 0); assert.equal(state.pagesCalls, 0); assert.equal(journal.size, 0);
}));
test("accepted Render request with a lost response is never blindly replayed", async () => fixture(async ({ execute, state, journal }) => {
  state.failRender = true; await assert.rejects(execute()); assert.equal(journal.get("api")?.status, "REQUESTED");
  state.failRender = false; await assert.rejects(execute()); assert.equal(state.renderCalls, 1);
}));
test("Pages partial failure preserves verified backend journal and blocks blind retry", async () => fixture(async ({ execute, state, journal }) => {
  state.failPages = true; await assert.rejects(execute()); assert.equal(state.renderCalls, 6); assert.equal(journal.get("pages")?.status, "REQUESTED");
  state.failPages = false; await assert.rejects(execute()); assert.equal(state.pagesCalls, 1); assert.equal(state.renderCalls, 6);
}));
