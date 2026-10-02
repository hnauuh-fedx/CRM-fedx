import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";

import { redisConnection } from "../../config/redis";
import { prisma } from "../../database/prisma";
import { executeRegisteredAutomationNode } from "./automation-action-registry";
import { decideNodeExecution } from "./automation-execution-state";
import type { AutomationContext, AutomationExecutionSource, ExecutableAutomationRule } from "./automation-execution.types";
import { validateAutomationGraph } from "./automation-graph.validator";
import { ensureAutomationRuleVersionSnapshot } from "./automation-rule-version.service";
import type { AutomationEdge, AutomationGraphData } from "./automation.types";

export type { AutomationContext, AutomationExecutionSource, ExecutableAutomationRule } from "./automation-execution.types";
export type ExecutionJobData = {
  context: AutomationContext;
  nodeId: string;
  graph: AutomationGraphData;
  logId: string;
};

const DEFAULT_AUTOMATION_QUEUE_NAME = "automation_engine_queue";
const DEFAULT_DELAY_MS_PER_MINUTE = 60_000;

export const AUTOMATION_QUEUE_NAME = getAutomationQueueName();
const delayMsPerMinute = getDelayMsPerMinute();
const isAutomationDisabled = process.env.DISABLE_AUTOMATION_WORKER === "true" || process.env.NODE_ENV === "test";

export const automationQueue = isAutomationDisabled
  ? null
  : new Queue<ExecutionJobData>(AUTOMATION_QUEUE_NAME, { connection: redisConnection as any });

async function enqueueAutomationJob(data: ExecutionJobData, delay = 0) {
  if (!automationQueue) throw new UnrecoverableError("Automation worker hiện không khả dụng.");
  await automationQueue.add("execute_node", data, {
    delay,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    jobId: `${data.logId}-${data.nodeId}`,
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function triggerAutomation(triggerType: string, context: Omit<AutomationContext, "ruleId">) {
  if (isAutomationDisabled) return;
  const lead = context.leadId
    ? await prisma.leads.findFirst({
        where: { id: context.leadId, deleted_at: null },
        select: { institution_program_id: true },
      })
    : null;
  if (context.leadId && !lead) return;
  const resolvedContext = {
    ...context,
    institutionProgramId: context.leadId
      ? lead?.institution_program_id ?? undefined
      : context.institutionProgramId,
  };
  const rules = await prisma.automation_rules.findMany({
    where: {
      is_active: true,
      archived_at: null,
      trigger_type: triggerType,
      OR: resolvedContext.institutionProgramId
        ? [{ institution_program_id: null }, { institution_program_id: resolvedContext.institutionProgramId }]
        : [{ institution_program_id: null }],
    },
    select: {
      id: true,
      version: true,
      trigger_type: true,
      graph_data: true,
      institution_program_id: true,
      created_by: true,
    },
  });
  for (const rule of rules) {
    try {
      await startAutomationExecution(
        {
          id: rule.id,
          version: rule.version,
          triggerType: rule.trigger_type,
          graphData: rule.graph_data as unknown as AutomationGraphData,
          institutionProgramId: rule.institution_program_id,
          createdBy: rule.created_by,
        },
        resolvedContext,
        "event",
        resolvedContext.actorId ?? null,
      );
    } catch (error) {
      console.error("Automation rule failed to start", {
        ruleId: rule.id,
        triggerType,
        error: toErrorMessage(error),
      });
    }
  }
}

export async function startAutomationExecution(
  rule: ExecutableAutomationRule,
  context: Omit<AutomationContext, "ruleId">,
  source: AutomationExecutionSource,
  requestedBy: string | null,
) {
  const validation = validateAutomationGraph(rule.graphData);
  if (!validation.valid) return { ok: false as const, reason: "invalid_graph" as const, validation };
  if (!automationQueue) return { ok: false as const, reason: "queue_unavailable" as const };
  const triggerNode = rule.graphData.nodes.find((node) => node.type === "trigger");
  if (!triggerNode) return { ok: false as const, reason: "invalid_graph" as const, validation };

  const version = await ensureAutomationRuleVersionSnapshot({
    ruleId: rule.id,
    version: rule.version,
    triggerType: rule.triggerType,
    graphData: rule.graphData,
    institutionProgramId: rule.institutionProgramId,
    createdBy: rule.createdBy ?? requestedBy,
  });
  const executionActorId = rule.createdBy ?? context.actorId;
  const executionContext: AutomationContext = { ...context, actorId: executionActorId, ruleId: rule.id };
  const log = await prisma.$transaction(async (tx) => {
    const createdLog = await tx.automation_execution_logs.create({
      data: {
        rule_id: rule.id,
        rule_version_id: version.id,
        requested_by: requestedBy,
        execution_actor_id: executionActorId,
        source,
        status: "processing",
        context_data: JSON.parse(JSON.stringify(executionContext)),
      },
      select: { id: true, status: true },
    });
    if (source === "manual_test" && requestedBy) {
      await tx.audit_logs.create({
        data: {
          user_id: requestedBy,
          entity_type: "automation_rule",
          entity_id: rule.id,
          action: "manual_test_run",
          new_data: {
            leadId: context.leadId,
            executionId: createdLog.id,
            executionActorId,
            version: version.version,
          },
        },
      });
    }
    return createdLog;
  });
  try {
    for (const { nextNodeId } of getNextNodes(triggerNode.id, rule.graphData, null)) {
      await enqueueAutomationJob({ context: executionContext, nodeId: nextNodeId, graph: rule.graphData, logId: log.id });
    }
    return { ok: true as const, data: { executionId: log.id, status: log.status, version: version.version } };
  } catch (error) {
    await prisma.automation_execution_logs.update({
      where: { id: log.id },
      data: { status: "failed", error_message: toErrorMessage(error), completed_at: new Date() },
    });
    throw error;
  }
}

async function processAutomationNode(job: Job<ExecutionJobData>) {
  const { context, nodeId, graph, logId } = job.data;
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new UnrecoverableError(`Không tìm thấy node ${nodeId} trong snapshot.`);

  const persisted = await prisma.automation_node_executions.findUnique({
    where: { execution_log_id_node_id: { execution_log_id: logId, node_id: nodeId } },
    select: { id: true, status: true, next_source_handle: true, delay_minutes: true },
  });
  const decision = decideNodeExecution(persisted ? {
    status: persisted.status,
    nextSourceHandle: persisted.next_source_handle,
    delayMinutes: persisted.delay_minutes,
  } : null);
  if (decision.kind === "already_completed") return;

  const nodeExecution = decision.kind === "execute_action"
    ? await prisma.automation_node_executions.upsert({
        where: { execution_log_id_node_id: { execution_log_id: logId, node_id: nodeId } },
        create: { execution_log_id: logId, node_id: nodeId, node_type: node.type, status: "processing", attempt_count: 1 },
        update: { status: "processing", attempt_count: { increment: 1 }, error_message: null },
        select: { id: true },
      })
    : await prisma.automation_node_executions.update({
        where: { id: persisted!.id },
        data: { attempt_count: { increment: 1 } },
        select: { id: true },
      });

  try {
    const actionResult = decision.kind === "reuse_action_result"
      ? { nextSourceHandle: decision.nextSourceHandle, delayMinutes: decision.delayMinutes }
      : await executeRegisteredAutomationNode(node, context, nodeExecution.id);
    const nextNodes = getNextNodes(node.id, graph, actionResult.nextSourceHandle);
    for (const { nextNodeId } of nextNodes) {
      await enqueueAutomationJob(
        { context, nodeId: nextNodeId, graph, logId },
        actionResult.delayMinutes * delayMsPerMinute,
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.automation_node_executions.update({
        where: { id: nodeExecution.id },
        data: { status: "completed", completed_at: new Date(), error_message: null },
      });
      if (nextNodes.length === 0) {
        await tx.automation_execution_logs.update({
          where: { id: logId },
          data: { status: "completed", completed_at: new Date(), error_message: null },
        });
      }
    });
  } catch (error) {
    await prisma.automation_node_executions.updateMany({
      where: { id: nodeExecution.id, status: { notIn: ["action_completed", "completed"] } },
      data: { status: "failed", error_message: toErrorMessage(error) },
    });
    await prisma.automation_execution_logs.update({
      where: { id: logId },
      data: {
        status: error instanceof UnrecoverableError ? "failed" : "processing",
        error_message: toErrorMessage(error),
        ...(error instanceof UnrecoverableError ? { completed_at: new Date() } : {}),
      },
    });
    throw error;
  }
}

export const automationWorker = isAutomationDisabled
  ? null
  : new Worker<ExecutionJobData>(AUTOMATION_QUEUE_NAME, processAutomationNode, {
      connection: redisConnection as any,
      concurrency: 5,
    });

automationWorker?.on("failed", async (job, error) => {
  console.error(`Automation Job failed: ${job?.id}`, error);
  if (!job?.data.logId) return;
  const attempts = job.opts.attempts ?? 1;
  if (!(error instanceof UnrecoverableError) && job.attemptsMade < attempts) return;
  await prisma.automation_execution_logs.update({
    where: { id: job.data.logId },
    data: { status: "failed", error_message: toErrorMessage(error), completed_at: new Date() },
  }).catch((updateError) => console.error("Không thể cập nhật execution log thất bại", updateError));
});

function getNextNodes(nodeId: string, graph: AutomationGraphData, sourceHandle: string | null) {
  const outgoingEdges = graph.edges.filter((edge: AutomationEdge) => edge.source === nodeId);
  if (sourceHandle === null) return outgoingEdges.map((edge) => ({ nextNodeId: edge.target, handle: edge.sourceHandle }));
  return outgoingEdges
    .filter((edge) => edge.sourceHandle === sourceHandle || (!edge.sourceHandle && sourceHandle === "default"))
    .map((edge) => ({ nextNodeId: edge.target, handle: edge.sourceHandle }));
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getAutomationQueueName() {
  if (process.env.NODE_ENV !== "integration") return DEFAULT_AUTOMATION_QUEUE_NAME;
  const queueName = process.env.AUTOMATION_QUEUE_NAME?.trim() || DEFAULT_AUTOMATION_QUEUE_NAME;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(queueName)) {
    throw new Error("AUTOMATION_QUEUE_NAME integration phải gồm 1-100 ký tự chữ, số, gạch dưới hoặc gạch ngang.");
  }
  return queueName;
}

function getDelayMsPerMinute() {
  if (process.env.NODE_ENV !== "integration") return DEFAULT_DELAY_MS_PER_MINUTE;
  const value = Number(process.env.AUTOMATION_DELAY_MS_PER_MINUTE ?? DEFAULT_DELAY_MS_PER_MINUTE);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("AUTOMATION_DELAY_MS_PER_MINUTE integration phải là số nguyên dương.");
  }
  return value;
}
