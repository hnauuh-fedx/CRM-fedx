import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareCloudDeployment } from "./cloud-plan";

const release = { commit: "a".repeat(40), version: "fixture", notes: "", apiImage: `ghcr.io/test/crm/api@sha256:${"b".repeat(64)}`, webImage: `ghcr.io/test/crm/web@sha256:${"c".repeat(64)}`, schemaGeneration: "g1", buildUrl: "https://example.test/build" };
const topology = { environment: "staging", schemaGeneration: "g1", publicApiOrigin: "https://api.example.test", publicWebOrigin: "https://crm.example.test", pages: { accountId: "d".repeat(32), projectName: "crm-staging" }, render: { api: "srv-api", webhooks: "srv-webhooks", automation: "srv-automation", integrations: "srv-integrations", reminders: "srv-reminders", monitor: "srv-monitor" } };

test("cloud planning produces a non-executable coordinated plan without changing Compose manifests", () => {
  const plan = prepareCloudDeployment(release, topology);
  assert.equal(plan.executable, false); assert.equal(plan.render.length, 6);
  assert.ok(plan.render.every(item => item.image === release.apiImage));
  assert.equal(plan.frontend.expectedCommit, release.commit); assert.equal(plan.readinessProbe, "https://api.example.test/api/ready");
  assert.ok(plan.requiredBeforeExecution.length > 0);
});

test("cloud plans reject mixed environments, arbitrary commands, duplicate services and credential URLs", () => {
  assert.throws(() => prepareCloudDeployment(release, { ...topology, schemaGeneration: "g2" }));
  assert.throws(() => prepareCloudDeployment(release, { ...topology, command: "deploy" }));
  assert.throws(() => prepareCloudDeployment(release, { ...topology, render: { ...topology.render, api: topology.render.monitor } }));
  assert.throws(() => prepareCloudDeployment(release, { ...topology, publicApiOrigin: "https://user:secret@example.test" }));
});
