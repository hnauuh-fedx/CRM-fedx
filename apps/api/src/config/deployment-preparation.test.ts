import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDeploymentPreparation } from "./deployment-preparation";

test("local preparation needs no cloud configuration and never emits secrets", () => {
  const result = checkDeploymentPreparation({ DATABASE_URL: "postgresql://fixture:secret@localhost/crm" }, "local");
  assert.ok(result.checks.every(check => check.status === "ready"));
  assert.equal(result.networkAccess, false); assert.ok(!JSON.stringify(result).includes("secret"));
});

test("valid cloud credentials do not falsely claim cloud deployment or file workflows are activated", () => {
  const result = checkDeploymentPreparation({ DATABASE_URL: "postgresql://fixture@db/crm", DATABASE_SSL_MODE: "verify-full", WEB_ORIGIN: "https://crm.example.test" }, "cloud");
  assert.equal(result.checks.find(check => check.name === "database-tls")?.status, "ready");
  assert.equal(result.checks.find(check => check.name === "release-orchestration")?.status, "pending");
  assert.equal(result.checks.find(check => check.name === "storage-workflow")?.status, "pending");
});
