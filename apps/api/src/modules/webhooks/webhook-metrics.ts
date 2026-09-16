type MetricLabels = Record<string, string | undefined>;

const counters = new Map<string, number>();
const durations = new Map<string, { count: number; totalMs: number; maxMs: number }>();

function metricKey(name: string, labels: MetricLabels = {}) {
  const normalized = Object.entries(labels)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  return normalized ? `${name}{${normalized}}` : name;
}

export function incrementWebhookMetric(name: string, labels: MetricLabels = {}) {
  const key = metricKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

export function observeWebhookDuration(name: string, valueMs: number, labels: MetricLabels = {}) {
  const key = metricKey(name, labels);
  const current = durations.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
  durations.set(key, {
    count: current.count + 1,
    totalMs: current.totalMs + valueMs,
    maxMs: Math.max(current.maxMs, valueMs),
  });
}

export function getWebhookMetricsSnapshot() {
  return {
    counters: Object.fromEntries(counters),
    durations: Object.fromEntries(durations),
  };
}

export function resetWebhookMetricsForTests() {
  counters.clear();
  durations.clear();
}
