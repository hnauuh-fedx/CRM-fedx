import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccessReleases, deploymentBlockReason, deploymentRequestSchema, releaseRegistrationSchema } from "@admission-crm/shared/releases";

const manifest = { commit: "a".repeat(40), version: "v1", notes: "", apiImage: `ghcr.io/org/crm/api@sha256:${"a".repeat(64)}`, webImage: `ghcr.io/org/crm/web@sha256:${"b".repeat(64)}`, schemaGeneration: "g1", buildUrl: "https://github.com/org/crm/actions/runs/1" };
test("only digest-pinned artifacts and complete commit identities can be registered", () => {
  assert.equal(releaseRegistrationSchema.safeParse(manifest).success, true);
  for (const changes of [{ apiImage: "ghcr.io/org/crm/api:latest" }, { commit: "main" }, { webImage: "https://evil/image" }, { command: "rm -rf /" }]) {
    assert.equal(releaseRegistrationSchema.safeParse({ ...manifest, ...changes }).success, false);
  }
});
test("program-scoped grants cannot control global deployments", () => {
  for (const scope of ["DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"]) assert.equal(canAccessReleases({ accessScope: scope, permissions: ["release.view", "release.deploy"] }, "deploy"), false);
  assert.equal(canAccessReleases({ accessScope: "ALL", permissions: ["system.manage"] }, "deploy"), false);
  assert.equal(canAccessReleases({ accessScope: "ALL", permissions: ["release.view"] }, "view"), true);
  assert.equal(canAccessReleases({ accessScope: "ALL", permissions: ["release.view"] }, "deploy"), false);
  assert.equal(canAccessReleases({ accessScope: "ALL", permissions: ["release.view", "release.deploy"] }, "deploy"), true);
});
const policy = { generation: "g1", targetGeneration: "g1", busy: false, blocked: false, currentReleaseId: "old", releaseId: "new", environment: "staging" as const, staged: false, operation: "deploy" as const, previouslyDeployed: false };
test("deployment requires schema compatibility, exclusive environment access, staging validation and safe rollback history", () => {
  assert.equal(deploymentBlockReason(policy), null);
  for (const changes of [{ blocked: true }, { busy: true }, { targetGeneration: "g2" }, { releaseId: "old" }, { environment: "production" as const }, { operation: "rollback" as const }]) assert.ok(deploymentBlockReason({ ...policy, ...changes }));
  assert.equal(deploymentBlockReason({ ...policy, environment: "production", staged: true }), null);
  assert.equal(deploymentBlockReason({ ...policy, operation: "rollback", previouslyDeployed: true }), null);
});
test("deployment requests cannot carry commands, actor identity or arbitrary environments", () => {
  const input = { releaseId: "01509354-7187-4e10-8b31-1dd86b2a3938", requestId: "01509354-7187-4e10-8b31-1dd86b2a3939", environment: "staging", operation: "deploy", reason: "Kiểm thử bản mới" };
  assert.equal(deploymentRequestSchema.safeParse(input).success, true);
  for (const changes of [{ command: "echo unsafe" }, { actor: { id: "admin" } }, { environment: "other" }, { reason: " " }]) assert.equal(deploymentRequestSchema.safeParse({ ...input, ...changes }).success, false);
});
