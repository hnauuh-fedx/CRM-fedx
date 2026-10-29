import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { UnrecoverableError } from "bullmq";
import { sessionDatabaseConnectionOptions } from "../../../config/postgres";

const pool = new Pool(sessionDatabaseConnectionOptions);
pool.on("error", () => {});
export async function withIntegrationLock<T>(identity: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const key = BigInt.asIntN(64, BigInt(`0x${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`)).toString();
  const client = await pool.connect();
  let broken = false;
  const onError = () => { broken = true; };
  client.on("error", onError);
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [key]);
    if (!lock.rows[0].acquired) throw new Error("Tác vụ đang được worker khác xử lý. Thử lại sau.");
    const result = await action(client);
    if (broken) throw new Error("Mất kết nối giữ khóa tác vụ. Cần kiểm tra trạng thái xử lý.");
    return result;
  } finally {
    if (!broken) await client.query("SELECT pg_advisory_unlock($1::bigint)", [key]).catch(() => { broken = true; });
    client.removeListener("error", onError); client.release(broken);
  }
}

export type IntegrationTask = { key: string; provider: "zalo" | "meta"; entityId: string; lock: string; action: () => Promise<unknown>; review: () => Promise<unknown>; terminal?: () => Promise<boolean> };
export async function runIntegrationTask(task: IntegrationTask) {
  return withIntegrationLock(task.lock, async client => {
    // Reuse the session that owns the lock: a small cloud pool must not need a second slot per active task.
    const existing = (await client.query("SELECT status FROM integration_task_receipts WHERE task_key=$1", [task.key])).rows[0];
    if (existing?.status === "completed") return { replayed: true };
    if (existing) {
      if (existing.status === "running" && task.terminal && await task.terminal()) {
        await client.query("UPDATE integration_task_receipts SET status='completed',finished_at=now() WHERE task_key=$1 AND status='running'", [task.key]);
        return { replayed: true };
      }
      await task.review();
      await client.query("UPDATE integration_task_receipts SET status='needs_review',finished_at=now() WHERE task_key=$1 AND status<>'completed'", [task.key]);
      throw new UnrecoverableError("Tác vụ trước đã bị gián đoạn hoặc chưa rõ kết quả. Cần đối soát trước khi chạy lại.");
    }
    await client.query("INSERT INTO integration_task_receipts(task_key,provider,entity_id,status) VALUES($1,$2,$3,'running')", [task.key, task.provider, task.entityId]);
    try {
      await task.action();
      await client.query("UPDATE integration_task_receipts SET status='completed',finished_at=now() WHERE task_key=$1 AND status='running'", [task.key]);
      return { replayed: false };
    } catch {
      // Processing may already have committed a lead/activity or called an external provider.
      // Quarantine instead of replaying a potentially non-idempotent action after a crash.
      await task.review().catch(() => {});
      await client.query("UPDATE integration_task_receipts SET status='needs_review',finished_at=now() WHERE task_key=$1 AND status='running'", [task.key]).catch(() => {});
      throw new UnrecoverableError("Không xác nhận được kết quả tác vụ tích hợp. Cần kiểm tra trước khi xử lý lại.");
    }
  });
}
export async function closeIntegrationLocks() { await pool.end(); }
