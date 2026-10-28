import { emptyAlertState, advanceAlerts, queueConditions, type AlertState, type Condition } from "./monitor-policy";
import type { QueueObservation, QueueSample } from "./queue-sampler";
import type { readMonitorConfig } from "./monitor-config";

type QueueUnavailable = { name: string; available: false };
export type MonitorDocument = {
  observedAt: number; staleAfterMs: number;
  producer?: { host: string; commit: string };
  observations: Record<string, QueueObservation>;
  snapshot: { redis: "healthy" | "unavailable" | "unused"; database: "healthy" | "unavailable"; queues: (QueueSample | QueueUnavailable)[] };
  alerts: AlertState;
};
export function emptyMonitorDocument(staleAfterMs: number): MonitorDocument {
  return { observedAt: 0, staleAfterMs, observations: {}, snapshot: { redis: "unused", database: "unavailable", queues: [] }, alerts: emptyAlertState() };
}
const queueKeys = ["worker", "backlog", "waiting", "failed", "active", "progress"];
async function boundedProbe<T>(probe: () => Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([probe(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Queue probe timeout")), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
export async function sampleMonitor(previous: MonitorDocument, input: {
  names: string[]; databaseReady: boolean;
  ping: () => Promise<unknown>;
  sample: (name: string, previous?: QueueObservation, now?: number) => Promise<{ sample: QueueSample; observation: QueueObservation }>;
  config: ReturnType<typeof readMonitorConfig>; now?: number; probeTimeoutMs?: number;
}) {
  const now = input.now ?? Date.now();
  const next = structuredClone(previous); next.observedAt = now;
  let redisReady = false;
  if (input.names.length) try { redisReady = await boundedProbe(input.ping, input.probeTimeoutMs ?? 3000) === "PONG"; } catch { /* Other queue conditions remain unknown during Redis failure. */ }
  next.snapshot = { redis: input.names.length ? redisReady ? "healthy" : "unavailable" : "unused", database: input.databaseReady ? "healthy" : "unavailable", queues: [] };
  const conditions: Condition[] = [
    { key: "redis", breached: input.names.length > 0 && !redisReady, message: "Redis không sẵn sàng cho các chức năng đang bật." },
    { key: "database", breached: !input.databaseReady, message: "Database lưu trạng thái giám sát không sẵn sàng hoặc chưa áp dụng migration." },
  ];
  const samples = await Promise.all(input.names.map(async name => {
    if (!redisReady) return null;
    try { return await boundedProbe(() => input.sample(name, previous.observations[name], now), input.probeTimeoutMs ?? 5000); } catch { return null; }
  }));
  for (const [index, name] of input.names.entries()) {
    const sampled = samples[index];
    conditions.push({ key: `queue:${name}:probe`, breached: redisReady ? !sampled : null, message: `${name}: không thể lấy trạng thái queue.` });
    if (sampled) {
      next.observations[name] = sampled.observation; next.snapshot.queues.push(sampled.sample);
      conditions.push(...queueConditions(sampled.sample, input.config.thresholds(name), now));
    } else {
      next.snapshot.queues.push({ name, available: false });
      conditions.push(...queueKeys.map(key => ({ key: `queue:${name}:${key}`, breached: null, message: `${name}: chưa xác nhận trạng thái.` })));
    }
  }
  // Explicitly disabling a queue resolves its incidents; a failed probe never does.
  for (const key of Object.keys(previous.alerts.incidents)) {
    if (key.startsWith("queue:") && !input.names.includes(key.split(":")[1])) conditions.push({ key, breached: false, message: "Queue đã được tắt trong cấu hình giám sát." });
  }
  next.alerts = advanceAlerts(previous.alerts, conditions, input.config.OPERATIONS_ENVIRONMENT, now, input.config.OPERATIONS_ALERT_AFTER_MS, input.config.OPERATIONS_RECOVERY_AFTER_MS);
  return next;
}
