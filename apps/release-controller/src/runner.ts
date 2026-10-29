import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { ReleaseEnvironment, ReleaseRegistration } from "@admission-crm/shared/releases";
import { pool, transaction } from "./store";
import { config } from "./config";

const execute = promisify(execFile);
const services = ["api", "web", "webhook-worker", "automation-worker", "integrations-worker", "reminders-worker", "operations-monitor"];
export function composeInvocation(directory: string, manifest: ReleaseRegistration) {
  if (!path.isAbsolute(directory)) throw new Error("Deployment directory must be absolute.");
  return {
    file: "docker",
    args: ["compose", "--project-directory", directory, "--env-file", path.join(directory, "release.env"), "-f", path.join(directory, "compose.yml")],
    env: { ...process.env, API_IMAGE: manifest.apiImage, WEB_IMAGE: manifest.webImage, RELEASE_COMMIT: manifest.commit },
  };
}
export async function applyRelease(environment: ReleaseEnvironment, manifest: ReleaseRegistration, event: (message: string) => Promise<void>, deploymentId?: string, assertActive?: () => void) {
  if (config.CONTROL_DEPLOYMENT_MODE === "render-cloudflare") {
    if (!deploymentId) throw new Error("Cloud deployment ID is required.");
    const { applyCloudRelease } = await import("./cloud-executor.js");
    return applyCloudRelease(environment, manifest, event, deploymentId, assertActive);
  }
  if (config.CONTROL_DEPLOYMENT_MODE !== "compose" || manifest.provider === "render-cloudflare") throw new Error("Deployment provider mismatch.");
  const directory = environment === "staging" ? config.CONTROL_STAGING_DIRECTORY : config.CONTROL_PRODUCTION_DIRECTORY;
  const command = composeInvocation(directory, manifest);
  // Commands and compose paths are operator-owned; browser/CI can never supply shell text.
  await event("Đang tải image đã xác thực.");
  await execute(command.file, [...command.args, "pull", ...services], { env: command.env, timeout: 600_000, maxBuffer: 1024 * 1024 });
  await event("Đang cập nhật web, API và các worker.");
  await execute(command.file, [...command.args, "up", "-d", "--wait", "--wait-timeout", "180", ...services], { env: command.env, timeout: 240_000, maxBuffer: 1024 * 1024 });
  // Probe inside the exact containers, avoiding reverse-proxy caches and old instances.
  const probe = `const image=JSON.parse(require('fs').readFileSync('/app/release.json','utf8'));const r=await fetch('http://127.0.0.1:3000/api/ready');const b=await r.json();if(!r.ok||image.commit!==${JSON.stringify(manifest.commit)}||b.commit!==image.commit)process.exit(1)`;
  await execute(command.file, [...command.args, "exec", "-T", "api", "node", "-e", probe], { env: command.env, timeout: 15_000 });
  const webProbe = `const r=await fetch('http://127.0.0.1:8080/version.json');const b=await r.json();if(!r.ok||b.commit!==${JSON.stringify(manifest.commit)})process.exit(1)`;
  // Web image includes Node for this probe and a static HTTP server.
  await execute(command.file, [...command.args, "exec", "-T", "web", "node", "-e", webProbe], { env: command.env, timeout: 15_000 });
  await event("Kiểm tra kết nối và mã phiên bản thành công.");
}

export async function startRunner(apply = applyRelease, interval = 1500) {
  // Retain a session-level advisory lock for the process lifetime: a second controller cannot deploy concurrently.
  const lock = await pool.connect();
  const acquired = (await lock.query("SELECT pg_try_advisory_lock(20481028) AS acquired")).rows[0].acquired;
  if (!acquired) { lock.release(); throw new Error("Another release controller is already running."); }
  let leaseLost = false;
  lock.on("error", () => { leaseLost = true; console.error("Controller lock connection lost. Stop and reconcile deployment state."); process.exit(1); });
  try { await transaction(async tx => {
    await tx.query("UPDATE environments SET blocked=true WHERE name IN (SELECT environment FROM deployments WHERE status='RUNNING')");
    await tx.query("INSERT INTO deployment_events(deployment_id,message) SELECT id,'Dịch vụ khởi động lại khi đang triển khai; cần kiểm tra thực tế.' FROM deployments WHERE status='RUNNING'");
    await tx.query("UPDATE deployments SET status='NEEDS_REVIEW',finished_at=now(),message='Triển khai bị gián đoạn. Cần đối soát trạng thái thực tế.' WHERE status='RUNNING'");
  }); } catch (error) {
    await lock.query("SELECT pg_advisory_unlock(20481028)").catch(() => {});
    lock.release(); throw error;
  }
  let stopping = false;
  let active: Promise<void> | null = null;
  const tick = async () => {
    const job = await transaction(async tx => {
      const row = (await tx.query("SELECT d.*,r.manifest FROM deployments d JOIN releases r ON r.id=d.release_id JOIN environments e ON e.name=d.environment WHERE d.status='QUEUED' AND NOT e.blocked ORDER BY d.created_at LIMIT 1 FOR UPDATE OF d SKIP LOCKED")).rows[0];
      if (row) await tx.query("UPDATE deployments SET status='RUNNING' WHERE id=$1", [row.id]);
      return row;
    });
    if (!job) return;
    const event = async (message: string) => { await pool.query("INSERT INTO deployment_events(deployment_id,message) VALUES($1,$2)", [job.id, message]); };
    try {
      await apply(job.environment, job.manifest, event, job.id, () => { if (leaseLost) throw new Error("Deployment lease lost."); });
      await transaction(async tx => {
        await tx.query("UPDATE environments SET current_release_id=$1 WHERE name=$2", [job.release_id, job.environment]);
        await tx.query("UPDATE deployments SET status='SUCCEEDED',finished_at=now(),message='Triển khai thành công.' WHERE id=$1", [job.id]);
      });
    } catch {
      // A timed-out CLI can leave Docker work in flight. Never claim the previous version is still active.
      await transaction(async tx => {
        await tx.query("UPDATE environments SET blocked=true WHERE name=$1", [job.environment]);
        await tx.query("UPDATE deployments SET status='NEEDS_REVIEW',finished_at=now(),message='Triển khai chưa được xác nhận. Kiểm tra container và kết nối trước khi thử tiếp.' WHERE id=$1", [job.id]);
        await tx.query("INSERT INTO deployment_events(deployment_id,message) VALUES($1,'Triển khai chưa được xác nhận; môi trường đã khóa để đối soát.')", [job.id]);
      });
    }
  };
  const timer = setInterval(() => {
    if (stopping || active) return;
    active = tick().catch(() => console.error("Deployment processing failed; durable state retained.")).finally(() => { active = null; });
  }, interval);
  return async () => { stopping = true; clearInterval(timer); await active; await lock.query("SELECT pg_advisory_unlock(20481028)"); lock.release(); };
}
