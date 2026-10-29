import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import type { Worker } from "bullmq";
import type { Redis } from "ioredis";
import { redisCommandConnection } from "../../config/redis";
import { releaseCommit } from "../../config/release-commit";
import { readMonitorConfig } from "./monitor-config";
import { heartbeatIndex, heartbeatPrefix, type WorkerHeartbeat } from "./worker-telemetry";
export function instrumentWorker(worker: Worker<any, any, string> | null, options?: { connection: Redis; environment: string; intervalMs: number; staleMs: number }) {
  if (!worker || (!options && process.env.NODE_ENV === "test")) return;
  const config = readMonitorConfig();
  const connection = options?.connection ?? redisCommandConnection;
  if (!connection) return;
  const intervalMs = options?.intervalMs ?? config.OPERATIONS_HEARTBEAT_MS;
  const staleMs = options?.staleMs ?? config.OPERATIONS_STALE_MS;
  const record: WorkerHeartbeat = { queue: worker.name, instance: `${hostname()}:${process.pid}:${randomUUID()}`, commit: releaseCommit(), at: 0, healthy: false, completed: 0, failed: 0, stalled: 0, lastSuccessAt: null, lastFailureAt: null, lastDurationMs: null };
  const key = heartbeatPrefix(options?.environment ?? config.OPERATIONS_ENVIRONMENT, worker.name) + record.instance;
  const index = heartbeatIndex(options?.environment ?? config.OPERATIONS_ENVIRONMENT, worker.name);
  let writing = false; let closed = false;
  const publish = async () => {
    if (writing || closed) return;
    writing = true;
    try {
      record.at = Date.now(); record.healthy = worker.isRunning() && !worker.isPaused() && !worker.closing;
      await connection.multi()
        .set(key, JSON.stringify(record), "PX", staleMs * 4)
        .zadd(index, record.at, record.instance)
        .zremrangebyscore(index, "-inf", record.at - staleMs * 4)
        .pexpire(index, staleMs * 8)
        .exec();
    } catch { /* Missing heartbeat is observed by the independent monitor; never fail a business job. */ }
    finally { writing = false; }
  };
  worker.on("completed", job => { record.completed++; record.lastSuccessAt = Date.now(); record.lastDurationMs = job.processedOn ? Math.max(0, Date.now() - job.processedOn) : null; });
  worker.on("failed", () => { record.failed++; record.lastFailureAt = Date.now(); });
  worker.on("stalled", () => { record.stalled++; });
  const timer = setInterval(() => void publish(), intervalMs); timer.unref();
  worker.once("closed", () => { closed = true; clearInterval(timer); void connection.multi().del(key).zrem(index, record.instance).exec().catch(() => {}); });
  void publish();
}
