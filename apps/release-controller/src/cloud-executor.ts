import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { postgresConnectionOptions, postgresEnvironmentSchema } from "@admission-crm/shared/postgres-config";
import type { ReleaseEnvironment, ReleaseRegistration } from "@admission-crm/shared/releases";
import { cloudTopologySchema } from "./cloud-plan";
import { createProviderClient, matchesRenderImage, publishPages } from "./cloud-providers";
import { loadCloudArtifact } from "./cloud-artifact";
import { config } from "./config";
import { pool } from "./store";

type Topology = ReturnType<typeof cloudTopologySchema.parse>;
export type ComponentRecord = { component: string; targetId: string; artifact: string; intentId: string; status: string; providerId?: string; previousId?: string };
export type CloudJournal = { load(component: string): Promise<ComponentRecord | null>; save(record: ComponentRecord): Promise<void> };
export function databaseCloudJournal(deploymentId: string): CloudJournal {
  return {
    async load(component) {
      const row = (await pool.query("SELECT * FROM deployment_components WHERE deployment_id=$1 AND component=$2", [deploymentId, component])).rows[0];
      return row ? { component, targetId: row.target_id, artifact: row.target_artifact, intentId: row.intent_id, status: row.status, providerId: row.provider_deployment_id ?? undefined, previousId: row.previous_deployment_id ?? undefined } : null;
    },
    async save(record) { await pool.query("INSERT INTO deployment_components(deployment_id,component,target_id,target_artifact,intent_id,status,provider_deployment_id,previous_deployment_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(deployment_id,component) DO UPDATE SET status=EXCLUDED.status,provider_deployment_id=EXCLUDED.provider_deployment_id,updated_at=now()", [deploymentId, record.component, record.targetId, record.artifact, record.intentId, record.status, record.providerId ?? null, record.previousId ?? null]); },
  };
}
export async function readCloudTopologies() {
  const json = JSON.parse(await readFile(config.CONTROL_CLOUD_TOPOLOGY_FILE!, "utf8"));
  const staging = cloudTopologySchema.parse(json.staging), production = cloudTopologySchema.parse(json.production);
  if (staging.environment !== "staging" || production.environment !== "production" || !staging.renderOwnerId || !production.renderOwnerId) throw new Error("Invalid cloud environment identity.");
  const targets = [...Object.values(staging.render), ...Object.values(production.render)];
  if (new Set(targets).size !== 12 || staging.pages.accountId === production.pages.accountId && staging.pages.projectName === production.pages.projectName || staging.publicApiOrigin === production.publicApiOrigin || staging.publicWebOrigin === production.publicWebOrigin) throw new Error("Cloud environments must have separate targets.");
  return { staging, production };
}

export type CloudDependencies = {
  client: ReturnType<typeof createProviderClient>;
  journal: CloudJournal;
  artifact: typeof loadCloudArtifact;
  publish: typeof publishPages;
  verify: (topology: Topology, commit: string) => Promise<void>;
  token: string;
  timeoutMs: number;
  pollMs: number;
  assertActive?: () => void;
};
const repository = (image: string) => image.split("@")[0].replace(/:[^/]+$/, "");
const inProgress = new Set(["created", "queued", "build_in_progress", "pre_deploy_in_progress", "update_in_progress", "pre_deploy_pending"]);
function assertRenderIdentity(service: any, id: string, topology: Topology, image: string) {
  if (service.id !== id || service.ownerId !== topology.renderOwnerId || !(service.autoDeployTrigger === "off" || service.autoDeploy === "no" || service.autoDeploy === false)) throw new Error("Render identity or auto-deploy policy mismatch.");
  const currentImage = service.imagePath ?? service.image?.imagePath ?? service.image?.ref ?? service.serviceDetails?.image?.imagePath;
  if (!currentImage || repository(currentImage) !== repository(image)) throw new Error("Render service does not use the expected image repository.");
  const component = Object.entries(topology.render).find(([, value]) => value === id)?.[0];
  const expectedFile: Record<string, string> = { api: "api.ts", webhooks: "workers/webhook.worker.ts", automation: "workers/automation.worker.ts", integrations: "workers/integrations.worker.ts", reminders: "workers/reminders.worker.ts", monitor: "workers/operations-monitor.worker.ts" };
  if (!component || service.type !== (component === "api" ? "web_service" : "background_worker") || service.serviceDetails?.runtime !== "image") throw new Error("Render service type/runtime mismatch.");
  const command = (service.serviceDetails?.envSpecificDetails?.dockerCommand ?? "").trim().replace(/\s+/g, " ");
  if (!(component === "api" && command === "") && command !== `node --import tsx apps/api/src/${expectedFile[component]}`) throw new Error("Render process command mismatch.");
}

export async function executeCloudRelease(topology: Topology, manifest: ReleaseRegistration, event: (message: string) => Promise<void>, dependencies: CloudDependencies) {
  if (manifest.provider !== "render-cloudflare" || !manifest.cloud || topology.schemaGeneration !== manifest.schemaGeneration) throw new Error("Cloud release is incompatible.");
  if ((topology.requiredCapabilities ?? []).some(value => !manifest.capabilities?.includes(value))) throw new Error("Release lacks required data capabilities.");
  const artifact = manifest.cloud[topology.environment];
  if (artifact.apiOrigin !== new URL(topology.publicApiOrigin).origin || artifact.webOrigin !== new URL(topology.publicWebOrigin).origin) throw new Error("Frontend artifact environment mismatch.");
  const { client, journal } = dependencies;
  const deadline = Date.now() + dependencies.timeoutMs;
  const check = () => { dependencies.assertActive?.(); if (Date.now() >= deadline) throw new Error("Cloud deployment deadline exceeded."); };
  const pause = () => new Promise(resolve => setTimeout(resolve, dependencies.pollMs));
  const stages = ["api", "webhooks", "automation", "integrations", "reminders", "monitor"] as const;
  const previous = new Map<string, string>();
  // Complete all preflight checks before the first mutation.
  for (const component of stages) {
    check(); const id = topology.render[component]; const service = await client.renderService(id);
    assertRenderIdentity(service, id, topology, manifest.apiImage);
    const deployments = await client.renderDeploys(id);
    if (deployments.some(item => inProgress.has(item.status))) throw new Error("Render already has an active deployment.");
    const live = deployments.find(item => item.status === "live"); if (live) previous.set(component, live.id);
  }
  const project = await client.pagesProject(topology.pages.accountId, topology.pages.projectName);
  if (project.name !== topology.pages.projectName || project.production_branch !== topology.pages.productionBranch || project.source) throw new Error("Pages must be the configured Direct Upload production project.");
  const pagesBefore = await client.pagesDeploys(topology.pages.accountId, topology.pages.projectName);
  if (pagesBefore.some(item => ["active", "idle"].includes(item.latest_stage?.status ?? ""))) throw new Error("Pages already has an active deployment.");
  for (const component of stages) if (!await journal.load(component)) await journal.save({ component, targetId: topology.render[component], artifact: manifest.apiImage, intentId: randomUUID(), status: "PLANNED", previousId: previous.get(component) });
  if (!await journal.load("pages")) await journal.save({ component: "pages", targetId: topology.pages.projectName, artifact: artifact.sha256, intentId: randomUUID(), status: "PLANNED", previousId: project.canonical_deployment?.id });
  const folder = await dependencies.artifact(artifact, manifest.commit);
  try {
    for (const component of stages) {
      check(); const id = topology.render[component];
      const old = await journal.load(component);
      if (old?.status === "VERIFIED") {
        const actual = await client.renderGet(id, old.providerId!);
        if (old.artifact !== manifest.apiImage || old.targetId !== id || actual.status !== "live" || !matchesRenderImage(actual, manifest.apiImage)) throw new Error("Verified Render deployment drifted.");
        continue;
      }
      if (old && old.status !== "PLANNED") throw new Error("Ambiguous previous provider request requires reconciliation.");
      const record: ComponentRecord = { ...old!, component, targetId: id, artifact: manifest.apiImage, intentId: old?.intentId ?? randomUUID(), status: "REQUESTED", previousId: previous.get(component) };
      await journal.save(record); check();
      await event(`Đang triển khai thành phần ${component}.`);
      // Never retry a mutating provider request after an unknown result.
      const created = await client.renderDeploy(id, manifest.apiImage);
      record.providerId = created.id; record.status = "VERIFYING"; await journal.save(record);
      for (;;) {
        check(); const current = await client.renderGet(id, created.id);
        if (current.status === "live") {
          if (!matchesRenderImage(current, manifest.apiImage)) throw new Error("Render digest mismatch.");
          const deployments = await client.renderDeploys(id);
          if (deployments.find(item => item.status === "live")?.id !== created.id || deployments.some(item => inProgress.has(item.status))) throw new Error("Concurrent Render deployment detected.");
          break;
        }
        if (!inProgress.has(current.status)) throw new Error("Render deployment did not succeed.");
        await pause();
      }
      record.status = "VERIFIED"; await journal.save(record);
    }
    for (;;) {
      check(); try { await dependencies.verify(topology, manifest.commit); break; } catch { await pause(); }
    }
    const oldPages = await journal.load("pages");
    if (oldPages && !["VERIFIED", "PLANNED"].includes(oldPages.status)) throw new Error("Ambiguous previous Pages request requires reconciliation.");
    if (!oldPages || oldPages.status === "PLANNED") {
      const record: ComponentRecord = { component: "pages", targetId: topology.pages.projectName, artifact: artifact.sha256, intentId: oldPages?.intentId ?? randomUUID(), status: "REQUESTED", previousId: project.canonical_deployment?.id };
      await journal.save(record); check(); await event("Đang phát hành giao diện.");
      await dependencies.publish(folder.directory, { ...topology.pages, commit: manifest.commit, intentId: record.intentId, token: dependencies.token, timeoutMs: Math.max(1, deadline - Date.now()) });
      for (;;) {
        check(); const candidates = (await client.pagesDeploys(topology.pages.accountId, topology.pages.projectName)).filter(item => item.environment === "production" && item.deployment_trigger.metadata.commit_hash === manifest.commit && item.deployment_trigger.metadata.commit_message === `crm-intent:${record.intentId}`);
        if (candidates.length > 1) throw new Error("Pages result is ambiguous.");
        if (candidates.length === 1) {
          record.providerId = candidates[0].id; record.status = "VERIFYING"; await journal.save(record);
          if (candidates[0].latest_stage?.status === "success") break;
          if (candidates[0].latest_stage?.status === "failure" || candidates[0].latest_stage?.status === "canceled") throw new Error("Pages deployment failed.");
        }
        await pause();
      }
      record.status = "VERIFIED"; await journal.save(record);
    }
    check();
    await observeCloudRelease(topology, manifest, dependencies); check();
    await event("Đã xác minh phiên bản API, worker và giao diện.");
  } finally { await folder.close(); }
}

export async function observeCloudRelease(topology: Topology, manifest: ReleaseRegistration, dependencies: CloudDependencies) {
  if (manifest.provider !== "render-cloudflare" || !manifest.cloud || manifest.schemaGeneration !== topology.schemaGeneration || (topology.requiredCapabilities ?? []).some(value => !manifest.capabilities?.includes(value))) throw new Error("Observed release is incompatible.");
  for (const [component, id] of Object.entries(topology.render)) {
    assertRenderIdentity(await dependencies.client.renderService(id), id, topology, manifest.apiImage);
    const live = await dependencies.client.renderDeploys(id);
    const current = live.find(item => item.status === "live");
    if (live.some(item => inProgress.has(item.status)) || !current || !matchesRenderImage(current, manifest.apiImage)) throw new Error(`Observed ${component} version is not confirmed.`);
  }
  const project = await dependencies.client.pagesProject(topology.pages.accountId, topology.pages.projectName);
  if (project.name !== topology.pages.projectName || project.production_branch !== topology.pages.productionBranch || project.source) throw new Error("Observed Pages project policy mismatch.");
  const pages = await dependencies.client.pagesDeploys(topology.pages.accountId, topology.pages.projectName);
  const canonical = pages.find(item => item.id === project.canonical_deployment?.id);
  if (!canonical || canonical.environment !== "production" || canonical.latest_stage?.status !== "success" || canonical.deployment_trigger.metadata.commit_hash !== manifest.commit) throw new Error("Observed Pages version is not confirmed.");
  const artifact = manifest.cloud[topology.environment];
  if (artifact.apiOrigin !== new URL(topology.publicApiOrigin).origin || artifact.webOrigin !== new URL(topology.publicWebOrigin).origin) throw new Error("Observed artifact environment mismatch.");
  const response = await fetch(new URL("/version.json", topology.publicWebOrigin), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  const version = await response.json();
  if (!response.ok || version.commit !== manifest.commit || version.apiOrigin !== artifact.apiOrigin || version.webOrigin !== artifact.webOrigin) throw new Error("Frontend version probe failed.");
  await dependencies.verify(topology, manifest.commit);
}

async function runtimeCloud(environment: ReleaseEnvironment, deploymentId: string, assertActive?: () => void) {
  const topologies = await readCloudTopologies(), topology = topologies[environment];
  const database = environment === "staging" ? config.CONTROL_STAGING_CRM_DATABASE_URL : config.CONTROL_PRODUCTION_CRM_DATABASE_URL;
  const crm = new Pool({ ...postgresConnectionOptions(postgresEnvironmentSchema.parse({ DATABASE_URL: database, DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: config.CONTROL_CRM_DATABASE_SSL_CA })), max: 2 });
  const verify = async (target: Topology, commit: string) => {
    const response = await fetch(new URL("/api/ready", target.publicApiOrigin), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok || (await response.json()).commit !== commit) throw new Error("API version mismatch.");
    const document = (await crm.query("SELECT value FROM operations_monitor_states WHERE key='main'")).rows[0]?.value;
    if (!document || Date.now() - document.observedAt > 60000 || document.producer?.commit !== commit || document.snapshot?.database !== "healthy" || document.snapshot?.redis !== "healthy" || !document.snapshot.queues.length) throw new Error("Monitor is not ready.");
    for (const queue of document.snapshot.queues) if (!queue.workers?.length || queue.workers.some((worker: { commit: string; at: number; healthy: boolean }) => worker.commit !== commit || !worker.healthy || Date.now() - worker.at > 60000)) throw new Error("Worker version mismatch.");
  };
  const validateData = async (manifest: ReleaseRegistration) => {
    const hasPrivate = (await crm.query("SELECT EXISTS(SELECT 1 FROM files WHERE storage_provider='s3' AND storage_status='ready') AS present")).rows[0].present;
    if (hasPrivate && !manifest.capabilities?.includes("private-files-v1")) throw new Error("Release cannot read existing private files.");
  };
  return { topology, validateData, close: () => crm.end(), dependencies: { client: createProviderClient({ renderToken: config.CONTROL_RENDER_TOKEN!, pagesToken: config.CONTROL_CLOUDFLARE_TOKEN! }), journal: databaseCloudJournal(deploymentId), artifact: loadCloudArtifact, publish: publishPages, verify, token: config.CONTROL_CLOUDFLARE_TOKEN!, timeoutMs: config.CONTROL_CLOUD_TIMEOUT_MS, pollMs: 3000, assertActive } };
}
export async function applyCloudRelease(environment: ReleaseEnvironment, manifest: ReleaseRegistration, event: (message: string) => Promise<void>, deploymentId: string, assertActive?: () => void) {
  const runtime = await runtimeCloud(environment, deploymentId, assertActive);
  try { await runtime.validateData(manifest); await executeCloudRelease(runtime.topology, manifest, event, runtime.dependencies); }
  catch (error) { await pool.query("UPDATE deployment_components SET status='UNKNOWN',updated_at=now() WHERE deployment_id=$1 AND status IN ('REQUESTED','VERIFYING')", [deploymentId]); throw error; }
  finally { await runtime.close(); }
}
export async function reconcileCloudRelease(environment: ReleaseEnvironment, manifest: ReleaseRegistration) {
  const runtime = await runtimeCloud(environment, "00000000-0000-4000-8000-000000000000");
  try { await runtime.validateData(manifest); await observeCloudRelease(runtime.topology, manifest, runtime.dependencies); } finally { await runtime.close(); }
}
