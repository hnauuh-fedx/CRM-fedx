import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import {
  deploymentBlockReason, type DeploymentRequest, type ReleaseRegistration,
} from "@admission-crm/shared/releases";
import { config } from "./config";

export const pool = new Pool({ connectionString: config.CONTROL_DATABASE_URL, max: 8 });
export class ControlError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function transaction<T>(action: (tx: PoolClient) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  try { await tx.query("BEGIN"); const result = await action(tx); await tx.query("COMMIT"); return result; }
  catch (error) { await tx.query("ROLLBACK"); throw error; }
  finally { tx.release(); }
}
export function releaseRow(row: any) { return { ...row.manifest, id: row.id, createdAt: row.created_at.toISOString() }; }
export function deploymentRow(row: any) {
  return { id: row.id, requestId: row.request_id, releaseId: row.release_id, environment: row.environment,
    operation: row.operation, reason: row.reason, version: row.manifest.version, status: row.status,
    actorName: row.actor_name, message: row.message, createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null };
}
export async function registerRelease(manifest: ReleaseRegistration) {
  if (![manifest.apiImage, manifest.webImage].every(image => image.startsWith(config.CONTROL_IMAGE_PREFIX))) {
    throw new ControlError(400, "Image không thuộc registry đã được cho phép.");
  }
  const inserted = await pool.query("INSERT INTO releases(id,commit,manifest) VALUES($1,$2,$3) ON CONFLICT(commit) DO NOTHING RETURNING *", [randomUUID(), manifest.commit, manifest]);
  const row = inserted.rows[0] ?? (await pool.query("SELECT * FROM releases WHERE commit=$1", [manifest.commit])).rows[0];
  // CI retries are accepted, but a published commit must never be rebound to another artifact.
  if (JSON.stringify(releaseRow(row)) !== JSON.stringify({ ...row.manifest, ...manifest, id: row.id, createdAt: row.created_at.toISOString() })) {
    throw new ControlError(409, "Commit đã đăng ký với thông tin hoặc image khác.");
  }
  return releaseRow(row);
}
export async function enqueueDeployment(input: DeploymentRequest, actor: { id: string; name: string }) {
  return transaction(async tx => {
    const state = (await tx.query("SELECT * FROM environments WHERE name=$1 FOR UPDATE", [input.environment])).rows[0];
    if (!state) throw new ControlError(503, "Môi trường chưa được khởi tạo.");
    const previous = (await tx.query("SELECT d.*,r.manifest FROM deployments d JOIN releases r ON r.id=d.release_id WHERE request_id=$1", [input.requestId])).rows[0];
    if (previous) {
      if (previous.release_id !== input.releaseId || previous.environment !== input.environment || previous.operation !== input.operation || previous.reason !== input.reason || previous.actor_id !== actor.id) throw new ControlError(409, "Mã yêu cầu đã dùng cho thao tác khác.");
      return deploymentRow(previous);
    }
    const release = (await tx.query("SELECT * FROM releases WHERE id=$1", [input.releaseId])).rows[0];
    if (!release) throw new ControlError(404, "Không tìm thấy phiên bản.");
    const busy = (await tx.query("SELECT 1 FROM deployments WHERE environment=$1 AND status IN ('QUEUED','RUNNING')", [input.environment])).rowCount! > 0;
    const successes = (await tx.query("SELECT DISTINCT environment FROM deployments WHERE release_id=$1 AND status='SUCCEEDED'", [input.releaseId])).rows;
    const reason = deploymentBlockReason({ generation: state.schema_generation, targetGeneration: release.manifest.schemaGeneration,
      busy, blocked: state.blocked, currentReleaseId: state.current_release_id, releaseId: input.releaseId,
      environment: input.environment, operation: input.operation,
      staged: successes.some(row => row.environment === "staging"), previouslyDeployed: successes.some(row => row.environment === input.environment) });
    if (reason) throw new ControlError(409, reason);
    const row = (await tx.query("INSERT INTO deployments(id,request_id,release_id,environment,operation,reason,actor_id,actor_name,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED') RETURNING *",
      [randomUUID(), input.requestId, input.releaseId, input.environment, input.operation, input.reason, actor.id, actor.name])).rows[0];
    await tx.query("INSERT INTO deployment_events(deployment_id,message) VALUES($1,$2)", [row.id, "Yêu cầu triển khai đã được lưu."]);
    return deploymentRow({ ...row, manifest: release.manifest });
  });
}
