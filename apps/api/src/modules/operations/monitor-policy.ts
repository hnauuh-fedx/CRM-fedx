import type { QueueSample } from "./queue-sampler";
import type { QueueThresholds } from "./monitor-config";

export type Condition = { key: string; message: string; breached: boolean | null };
export type Incident = { active: boolean; badSince: number | null; goodSince: number | null; openedAt: number | null };
export type AlertEvent = { id: string; environment: string; key: string; phase: "FIRING" | "RESOLVED"; message: string; at: number; attempts: number; nextAttemptAt: number };
export type AlertState = { incidents: Record<string, Incident>; pending: AlertEvent[]; history: AlertEvent[] };
export const emptyAlertState = (): AlertState => ({ incidents: {}, pending: [], history: [] });
export function queueConditions(sample: QueueSample, thresholds: QueueThresholds, now = Date.now()): Condition[] {
  const work = sample.waiting + sample.overdueDelayed + sample.active > 0;
  const prefix = `queue:${sample.name}`;
  return [
    { key: `${prefix}:worker`, breached: sample.liveWorkers === 0, message: `${sample.name}: không có worker khỏe với heartbeat còn hiệu lực.` },
    { key: `${prefix}:backlog`, breached: sample.waiting + sample.overdueDelayed >= thresholds.waitingCount, message: `${sample.name}: số job đến hạn đang chờ vượt ngưỡng.` },
    { key: `${prefix}:waiting`, breached: sample.waitingAgeMs >= thresholds.waitingMs, message: `${sample.name}: job đến hạn đã chờ quá lâu.` },
    { key: `${prefix}:failed`, breached: sample.failed >= thresholds.failedCount, message: `${sample.name}: số job lỗi đang lưu vượt ngưỡng.` },
    { key: `${prefix}:active`, breached: sample.activeAgeMs >= thresholds.activeMs, message: `${sample.name}: job đang xử lý vượt thời gian cho phép.` },
    { key: `${prefix}:progress`, breached: work && sample.oldestWorkAgeMs >= thresholds.noProgressMs && (!sample.lastSuccessAt || now - sample.lastSuccessAt >= thresholds.noProgressMs), message: `${sample.name}: có công việc đến hạn nhưng chưa ghi nhận xử lý thành công trong ngưỡng cho phép.` },
  ];
}
export function advanceAlerts(previous: AlertState, conditions: Condition[], environment: string, now: number, firingAfter: number, recoveryAfter: number): AlertState {
  const state = structuredClone(previous);
  for (const condition of conditions) {
    const incident = state.incidents[condition.key] ?? { active: false, badSince: null, goodSince: null, openedAt: null };
    state.incidents[condition.key] = incident;
    if (condition.breached === null) { incident.goodSince = null; incident.badSince = null; continue; }
    let phase: AlertEvent["phase"] | null = null;
    if (condition.breached) {
      incident.goodSince = null; incident.badSince ??= now;
      if (!incident.active && now - incident.badSince >= firingAfter) { incident.active = true; incident.openedAt = now; phase = "FIRING"; }
    } else {
      incident.badSince = null; incident.goodSince ??= now;
      if (incident.active && now - incident.goodSince >= recoveryAfter) { incident.active = false; phase = "RESOLVED"; }
    }
    if (phase) {
      const event: AlertEvent = { id: `${environment}:${condition.key}:${incident.openedAt}:${phase}`, environment, key: condition.key, phase, message: phase === "FIRING" ? condition.message : `Đã phục hồi: ${condition.message}`, at: now, attempts: 0, nextAttemptAt: now };
      // Coalesce undelivered transitions for one incident key to its latest state.
      // The bounded history retains transitions; webhook receivers receive the current state and a stable event ID.
      state.pending = state.pending.filter(item => item.key !== event.key);
      state.pending.push(event); state.history.push(event); state.history = state.history.slice(-100);
    }
  }
  return state;
}
