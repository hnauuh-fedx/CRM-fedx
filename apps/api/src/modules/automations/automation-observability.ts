import { createHash } from "node:crypto";

export type AutomationExecutionHealth = "queued" | "processing" | "completed" | "failed" | "stuck";

export type ReassignmentProgramMetric = {
  institutionProgramId: string | null;
  institutionProgramName: string;
  pending: number;
  warned: number;
  reassigned: number;
  cancelled: number;
  failed: number;
  delaySampleCount: number;
  averageDelayMs: number | null;
};

const SENSITIVE_KEY_PATTERN = /(^|_)(authorization|cccd|email|password|phone|phone_number|secret|token)($|_)/i;

export function summarizeReassignmentMetrics(rows: ReassignmentProgramMetric[]) {
  const totals = rows.reduce((result, row) => ({
    pending: result.pending + row.pending,
    warned: result.warned + row.warned,
    reassigned: result.reassigned + row.reassigned,
    cancelled: result.cancelled + row.cancelled,
    failed: result.failed + row.failed,
    delaySampleCount: result.delaySampleCount + row.delaySampleCount,
    weightedDelayMs: result.weightedDelayMs + (row.averageDelayMs ?? 0) * row.delaySampleCount,
  }), {
    pending: 0,
    warned: 0,
    reassigned: 0,
    cancelled: 0,
    failed: 0,
    delaySampleCount: 0,
    weightedDelayMs: 0,
  });

  return {
    pending: totals.pending,
    warned: totals.warned,
    reassigned: totals.reassigned,
    cancelled: totals.cancelled,
    failed: totals.failed,
    averageDelayMs: totals.delaySampleCount > 0 ? totals.weightedDelayMs / totals.delaySampleCount : null,
  };
}

export function classifyAutomationExecution(input: {
  status: string;
  lastProgressAt: Date;
  completedAt: Date | null;
  nextRunAt: Date | null;
  now: Date;
  stuckAfterMinutes: number;
}): AutomationExecutionHealth {
  if (input.status === "processing" && !input.completedAt) {
    if (input.nextRunAt && input.nextRunAt.getTime() > input.now.getTime()) return "processing";
    const ageMs = input.now.getTime() - input.lastProgressAt.getTime();
    if (ageMs >= input.stuckAfterMinutes * 60_000) return "stuck";
  }
  if (input.status === "queued") return "queued";
  if (input.status === "completed") return "completed";
  if (input.status === "failed") return "failed";
  return "processing";
}

export function automationExecutionStatusWhere(
  status: "processing" | "completed" | "failed" | "stuck",
  now: Date,
  stuckAfterMinutes: number,
) {
  if (status !== "processing" && status !== "stuck") return { status };

  const stuckBefore = new Date(now.getTime() - stuckAfterMinutes * 60_000);
  const staleProgress = {
    OR: [
      { last_progress_at: { lte: stuckBefore } },
      { last_progress_at: null, started_at: { lte: stuckBefore } },
    ],
  };
  const delayIsDue = { OR: [{ next_run_at: null }, { next_run_at: { lte: now } }] };
  const stuckPredicate = { completed_at: null, AND: [staleProgress, delayIsDue] };

  return status === "stuck"
    ? { status: "processing", ...stuckPredicate }
    : { status: "processing", NOT: stuckPredicate };
}

export function redactAutomationValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`))) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) return value.map((item) => redactAutomationValue(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactAutomationValue(entryValue, entryKey),
    ]),
  );
}

export function redactAutomationText(value: string | null) {
  if (!value) return value;
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?<!\d)\d{12}(?!\d)/g, "[REDACTED_ID]")
    .replace(/(?<!\d)(?:\+?84|0)(?:[ .-]?\d){8,10}(?!\d)/g, "[REDACTED_PHONE]")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED_TOKEN]");
}

export function selectRecoverableNodeIds(
  nodes: Array<{ nodeId: string; status: string; nextSourceHandle?: string | null }>,
  entryNodeIds: string[],
  edges: Array<{ source: string; target: string; sourceHandle?: string | null }> = [],
) {
  const failedNodeIds = nodes
    .filter((node) => node.status === "failed")
    .map((node) => node.nodeId);
  if (failedNodeIds.length > 0) return [...new Set(failedNodeIds)];

  const recoverableNodeIds = nodes
    .filter((node) => node.status === "processing" || node.status === "action_completed")
    .map((node) => node.nodeId);
  if (recoverableNodeIds.length > 0) return [...new Set(recoverableNodeIds)];

  const completedNodes = nodes.filter((node) => node.status === "completed");
  const completed = new Set(completedNodes.map((node) => node.nodeId));
  const completedById = new Map(completedNodes.map((node) => [node.nodeId, node]));
  const recorded = new Set(nodes.map((node) => node.nodeId));
  const missingFrontier = edges
    .filter((edge) => {
      const source = completedById.get(edge.source);
      if (!source || recorded.has(edge.target)) return false;
      if (source.nextSourceHandle == null) return true;
      return edge.sourceHandle === source.nextSourceHandle
        || (!edge.sourceHandle && source.nextSourceHandle === "default");
    })
    .map((edge) => edge.target);
  if (missingFrontier.length > 0) return [...new Set(missingFrontier)];
  return [...new Set(entryNodeIds.filter((nodeId) => !completed.has(nodeId)))];
}

type ComparableGraph = {
  nodes: Array<{ id: string; [key: string]: unknown }>;
  edges: Array<{ id: string; [key: string]: unknown }>;
};

function changedIds(
  before: Array<{ id: string; [key: string]: unknown }>,
  after: Array<{ id: string; [key: string]: unknown }>,
) {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  return after
    .filter((item) => beforeById.has(item.id) && JSON.stringify(beforeById.get(item.id)) !== JSON.stringify(item))
    .map((item) => item.id)
    .sort();
}

export function compareAutomationVersions(before: ComparableGraph, after: ComparableGraph) {
  const beforeNodeIds = new Set(before.nodes.map((node) => node.id));
  const afterNodeIds = new Set(after.nodes.map((node) => node.id));
  const beforeEdgeIds = new Set(before.edges.map((edge) => edge.id));
  const afterEdgeIds = new Set(after.edges.map((edge) => edge.id));

  return {
    addedNodeIds: [...afterNodeIds].filter((id) => !beforeNodeIds.has(id)).sort(),
    removedNodeIds: [...beforeNodeIds].filter((id) => !afterNodeIds.has(id)).sort(),
    changedNodeIds: changedIds(before.nodes, after.nodes),
    addedEdgeIds: [...afterEdgeIds].filter((id) => !beforeEdgeIds.has(id)).sort(),
    removedEdgeIds: [...beforeEdgeIds].filter((id) => !afterEdgeIds.has(id)).sort(),
  };
}

export function createReplayExecutionId(sourceExecutionId: string, requestId: string) {
  const hex = createHash("sha256").update(`automation-replay:${sourceExecutionId}:${requestId}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(hex[16]!, 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
