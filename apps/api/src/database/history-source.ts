import { AsyncLocalStorage } from "node:async_hooks";

export type HistorySource = {
  channel: "api" | "webhook" | "public_form" | "automation";
  name?: string;
  ruleId?: string;
  webhookId?: string;
  requestId?: string;
};

// Execution provenance is independent of the principal used for permission/scope checks.
const historySource = new AsyncLocalStorage<HistorySource>();
export function withHistorySource<T>(source: HistorySource, run: () => T): T {
  return historySource.run(source, run);
}

export function historyData<T>(data: T, field: "metadata" | "new_data"): T {
  const source = historySource.getStore();
  if (!source) return data;
  const row = data as Record<string, unknown>;
  const value = row[field];
  if (value != null && (typeof value !== "object" || Array.isArray(value))) return data;
  return { ...row, [field]: { ...value, executionSource: source } } as T;
}
