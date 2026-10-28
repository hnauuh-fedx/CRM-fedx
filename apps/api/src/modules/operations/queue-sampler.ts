import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { z } from "zod";
import { heartbeatIndex, heartbeatPrefix, type WorkerHeartbeat } from "./worker-telemetry";

const heartbeatSchema = z.object({ queue: z.string().max(150), instance: z.string().max(400), commit: z.string().max(100), at: z.number().finite(), healthy: z.boolean(), completed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), stalled: z.number().int().nonnegative(), lastSuccessAt: z.number().nullable(), lastFailureAt: z.number().nullable(), lastDurationMs: z.number().nullable() });
export type QueueObservation = { heads: Record<string, { id: string; since: number }>; lastSuccessAt: number | null };
export type QueueSample = { name: string; waiting: number; active: number; failed: number; delayed: number; overdueDelayed: number; waitingAgeMs: number; activeAgeMs: number; oldestWorkAgeMs: number; lastSuccessAt: number | null; liveWorkers: number; workers: WorkerHeartbeat[] };
export class QueueSampler {
  private queues = new Map<string, Queue>();
  constructor(private connection: Redis, private environment: string, private staleMs: number) {}
  async sample(name: string, previous: QueueObservation = { heads: {}, lastSuccessAt: null }, now = Date.now()): Promise<{ sample: QueueSample; observation: QueueObservation }> {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection as never, skipMetasUpdate: true });
      queue.on("error", () => {}); this.queues.set(name, queue);
    }
    const prefix = heartbeatPrefix(this.environment, name);
    const workers: WorkerHeartbeat[] = [];
    const instances = await this.connection.zrangebyscore(heartbeatIndex(this.environment, name), now - this.staleMs * 4, "+inf", "LIMIT", 0, 1001);
    if (instances.length > 1000) throw new Error("Too many worker instances to sample safely");
    if (instances.length) {
      const values = await this.connection.mget(...instances.map(instance => prefix + instance));
      for (const value of values) {
        try { const parsed = heartbeatSchema.safeParse(JSON.parse(value ?? "null")); if (parsed.success && parsed.data.queue === name) workers.push(parsed.data); } catch { /* Malformed telemetry is ignored, never treated as a healthy worker. */ }
      }
    }
    const [counts, waiting, priority, paused, active, delayedScore, overdueDelayed] = await Promise.all([
      queue.getJobCounts("wait", "paused", "prioritized", "active", "failed", "delayed"),
      queue.getJobs(["wait"], 0, 0, true), queue.getJobs(["prioritized"], 0, 0, true), queue.getJobs(["paused"], 0, 0, true),
      queue.getJobs(["active"], 0, 99, true),
      this.connection.zrange(queue.toKey("delayed"), 0, 0, "WITHSCORES"),
      this.connection.zcount(queue.toKey("delayed"), "-inf", now * 4096 + 4095),
    ]);
    const heads: QueueObservation["heads"] = {};
    let waitingAgeMs = 0;
    for (const [kind, jobs] of [["wait", waiting], ["prioritized", priority], ["paused", paused]] as const) {
      const id = jobs[0]?.id;
      if (!id) continue;
      const since = previous.heads[kind]?.id === id ? previous.heads[kind].since : now;
      heads[kind] = { id, since }; waitingAgeMs = Math.max(waitingAgeMs, now - since);
    }
    // BullMQ v5 encodes delayed due time in the high bits (getDelayedScore.lua).
    // Unlike job.timestamp + delay, this remains correct after retries/backoff.
    const dueAt = delayedScore.length ? Math.floor(Number(delayedScore[1]) / 4096) : now;
    const delayedAgeMs = overdueDelayed > 0 ? Math.max(0, now - dueAt) : 0;
    const activeAgeMs = active.reduce((age, job) => Math.max(age, job.processedOn ? now - job.processedOn : 0), 0);
    const lastSuccessAt = Math.max(previous.lastSuccessAt ?? 0, ...workers.map(worker => worker.lastSuccessAt ?? 0)) || null;
    const sample: QueueSample = { name, waiting: (counts.wait ?? 0) + (counts.paused ?? 0) + (counts.prioritized ?? 0), active: counts.active ?? 0, failed: counts.failed ?? 0, delayed: counts.delayed ?? 0, overdueDelayed, waitingAgeMs: Math.max(waitingAgeMs, delayedAgeMs), activeAgeMs, oldestWorkAgeMs: Math.max(waitingAgeMs, delayedAgeMs, activeAgeMs), lastSuccessAt, liveWorkers: workers.filter(worker => worker.healthy && now - worker.at <= this.staleMs && worker.at <= now + 5000).length, workers };
    return { sample, observation: { heads, lastSuccessAt } };
  }
  async close() { await Promise.allSettled([...this.queues.values()].map(queue => queue.close())); }
}
