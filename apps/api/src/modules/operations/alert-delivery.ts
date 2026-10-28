import type { AlertEvent, AlertState } from "./monitor-policy";

export async function sendAlert(event: AlertEvent, target: { url?: string; token?: string }) {
  if (!target.url) return;
  const response = await fetch(target.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json", "Idempotency-Key": event.id, ...(target.token ? { Authorization: `Bearer ${target.token}` } : {}) },
    body: JSON.stringify({ eventId: event.id, environment: event.environment, condition: event.key, state: event.phase, message: event.message, observedAt: new Date(event.at).toISOString() }),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("Alert receiver did not acknowledge delivery");
}
export async function flushAlerts(state: AlertState, send: (event: AlertEvent) => Promise<void>, now = Date.now()) {
  const remaining: AlertEvent[] = [];
  // At most 10 requests per poll. A failing receiver must not block monitoring for minutes.
  const due = state.pending.filter(event => event.nextAttemptAt <= now).slice(0, 10);
  const ids = new Set(due.map(event => event.id));
  remaining.push(...state.pending.filter(event => !ids.has(event.id)));
  await Promise.all(due.map(async event => {
    try { await send(event); }
    catch { remaining.push({ ...event, attempts: event.attempts + 1, nextAttemptAt: now + Math.min(900000, 30000 * 2 ** Math.min(event.attempts, 5)) }); }
  }));
  state.pending = remaining;
}
