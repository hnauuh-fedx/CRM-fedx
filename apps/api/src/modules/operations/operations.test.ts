import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReadiness } from "./readiness";
import { resolveRedisFeatures, requiresRedis, monitoredQueueNames } from "./redis-features";
import { advanceAlerts, emptyAlertState, queueConditions } from "./monitor-policy";
import { readMonitorConfig } from "./monitor-config";
import { flushAlerts } from "./alert-delivery";
import { emptyMonitorDocument, sampleMonitor } from "./operations-monitor";
import type { QueueSample } from "./queue-sampler";

const off = { webhook: false, automation: false, zalo: false, meta: false, reminders: false };
test("readiness requires Redis for every enabled feature, even with webhooks disabled", async () => {
  for (const key of Object.keys(off)) {
    const features = { ...off, [key]: true };
    assert.equal(await checkReadiness({ database: async () => 1, redis: null, features }), false);
    assert.equal(await checkReadiness({ database: async () => 1, redis: async () => "bad", features }), false);
    assert.equal(await checkReadiness({ database: async () => 1, redis: async () => "PONG", features }), true);
  }
  assert.equal(await checkReadiness({ database: async () => 1, redis: null, features: off }), true);
  assert.equal(await checkReadiness({ database: async () => { throw new Error("db"); }, redis: null, features: off }), false);
  assert.equal(await checkReadiness({ database: () => new Promise(() => {}), redis: null, features: off }, 10), false);
  assert.equal(await checkReadiness({ database: async () => 1, redis: () => new Promise(() => {}), features: { ...off, automation: true } }, 10), false);
});
test("feature flags and monitor queue catalog agree on all automation and integration queues", () => {
  assert.equal(requiresRedis(resolveRedisFeatures({ WEBHOOK_QUEUE_ENABLED: false })), true);
  const features = resolveRedisFeatures({ WEBHOOK_QUEUE_ENABLED: false, DISABLE_AUTOMATION_WORKER: "true", ZALO_QUEUE_ENABLED: false, META_QUEUE_ENABLED: false, REMINDER_QUEUE_ENABLED: false });
  assert.equal(requiresRedis(features), false);
  assert.equal(monitoredQueueNames(resolveRedisFeatures({})).length, 8);
  assert.deepEqual(monitoredQueueNames({ ...off, automation: true }, "custom"), ["custom", "custom_bulk_prepare", "custom_bulk_lead", "custom_reassignment"]);
});
test("alerts debounce, deduplicate, recover and preserve uncertainty during failed probes", () => {
  const bad = [{ key: "redis", breached: true, message: "Redis không sẵn sàng" }];
  let state = advanceAlerts(emptyAlertState(), bad, "test", 0, 100, 50);
  assert.equal(state.pending.length, 0);
  state = advanceAlerts(state, bad, "test", 100, 100, 50);
  assert.equal(state.pending[0].phase, "FIRING");
  const firstId = state.pending[0].id;
  state = advanceAlerts(state, bad, "test", 200, 100, 50);
  assert.equal(state.pending.length, 1); assert.equal(state.pending[0].id, firstId);
  state = advanceAlerts(state, [{ ...bad[0], breached: null }], "test", 300, 100, 50);
  assert.equal(state.incidents.redis.active, true);
  state = advanceAlerts(state, [{ ...bad[0], breached: false }], "test", 400, 100, 50);
  assert.equal(state.incidents.redis.active, true);
  state = advanceAlerts(state, [{ ...bad[0], breached: false }], "test", 450, 100, 50);
  assert.equal(state.incidents.redis.active, false);
  assert.equal(state.pending.length, 1); assert.equal(state.pending[0].phase, "RESOLVED");
  assert.equal(state.history.length, 2);
});
const sample: QueueSample = { name: "test", waiting: 0, active: 0, failed: 0, delayed: 1000, overdueDelayed: 0, waitingAgeMs: 0, activeAgeMs: 0, oldestWorkAgeMs: 0, lastSuccessAt: null, liveWorkers: 1, workers: [] };
test("future jobs and idle queues do not trigger backlog/progress alerts; stuck work does", () => {
  const thresholds = readMonitorConfig({}).thresholds("test");
  assert.equal(queueConditions(sample, thresholds).some(condition => condition.breached), false);
  const hung = queueConditions({ ...sample, active: 1, activeAgeMs: 1_000_000, oldestWorkAgeMs: 1_000_000 }, thresholds);
  assert.equal(hung.find(condition => condition.key.endsWith(":active"))?.breached, true);
  assert.equal(hung.find(condition => condition.key.endsWith(":progress"))?.breached, true);
});
test("webhook delivery retries with stable IDs and backoff without depending on Redis", async () => {
  const state = advanceAlerts(emptyAlertState(), [{ key: "redis", breached: true, message: "Redis" }], "test", 1, 0, 0);
  const id = state.pending[0].id;
  await flushAlerts(state, async () => { throw new Error("receiver down"); }, 1);
  assert.equal(state.pending[0].id, id); assert.equal(state.pending[0].attempts, 1);
  let sent = 0;
  await flushAlerts(state, async () => { sent++; }, 2);
  assert.equal(sent, 0);
  await flushAlerts(state, async event => { assert.equal(event.id, id); sent++; }, 30001);
  assert.equal(sent, 1); assert.equal(state.pending.length, 0);
});
test("Redis failure freezes queue incidents and can still produce an independent alert", async () => {
  const config = readMonitorConfig({ OPERATIONS_ALERT_AFTER_MS: "0", OPERATIONS_RECOVERY_AFTER_MS: "0" });
  let previous = emptyMonitorDocument(60000);
  previous.alerts = advanceAlerts(previous.alerts, [{ key: "queue:test:worker", breached: true, message: "worker" }], "test", 0, 0, 0);
  const result = await sampleMonitor(previous, { names: ["test"], databaseReady: true, config, now: 100,
    ping: async () => { throw new Error("redis"); }, sample: async () => { throw new Error("must not probe"); } });
  assert.equal(result.snapshot.redis, "unavailable");
  assert.equal(result.alerts.incidents["queue:test:worker"].active, true);
  assert.equal(result.alerts.incidents.redis.active, true);
});
test("a hanging queue probe has a deadline and does not block alert evaluation", async () => {
  const config = readMonitorConfig({ OPERATIONS_ALERT_AFTER_MS: "0" });
  const result = await sampleMonitor(emptyMonitorDocument(60000), { names: ["test"], databaseReady: true, config, probeTimeoutMs: 10,
    ping: async () => "PONG", sample: () => new Promise(() => {}) });
  assert.equal(result.alerts.incidents["queue:test:probe"].active, true);
  assert.equal(result.snapshot.redis, "healthy");
});
test("per-queue thresholds and webhook transport configuration are validated", () => {
  const config = readMonitorConfig({ OPERATIONS_QUEUE_THRESHOLDS: '{"long_running":{"activeMs":7200000}}' });
  assert.equal(config.thresholds("long_running").activeMs, 7200000);
  assert.equal(config.thresholds("other").activeMs, 900000);
  assert.throws(() => readMonitorConfig({ OPERATIONS_QUEUE_THRESHOLDS: '{"bad":{"failedCount":0}}' }));
  assert.throws(() => readMonitorConfig({ NODE_ENV: "production", OPERATIONS_ALERT_WEBHOOK_URL: "http://localhost:9000" }));
});
