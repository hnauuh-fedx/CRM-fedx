import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";

import { redisConnection } from "../../config/redis";
import { prisma } from "../../database/prisma";
import { executeRegisteredAutomationNode } from "./automation-action-registry";
import { decideNodeExecution } from "./automation-execution-state";
import type { AutomationContext, AutomationExecutionSource, ExecutableAutomationRule } from "./automation-execution.types";
import { validateAutomationGraph, withAutomationTriggerType } from "./automation-graph.validator";
import { ensureAutomationRuleVersionSnapshot } from "./automation-rule-version.service";
import { closeAutomationReassignmentQueue } from "./automation-reassignment-queue.service";
import type { AutomationEdge, AutomationGraphData } from "./automation.types";

export type { AutomationContext, AutomationExecutionSource, ExecutableAutomationRule } from "./automation-execution.types";
export type ExecutionJobData = {
  context: AutomationContext;
  nodeId: string;
  graph: AutomationGraphData;
  logId: string;
};
type AutomationBulkPrepareJobData = { bulkJobId: string };
type AutomationBulkLeadJobData = { bulkJobId: string; leadId: string };

const DEFAULT_AUTOMATION_QUEUE_NAME = "automation_engine_queue";
const DEFAULT_DELAY_MS_PER_MINUTE = 60_000;

export const AUTOMATION_QUEUE_NAME = getAutomationQueueName();
const AUTOMATION_BULK_PREPARE_QUEUE_NAME = `${AUTOMATION_QUEUE_NAME}_bulk_prepare`;
const AUTOMATION_BULK_LEAD_QUEUE_NAME = `${AUTOMATION_QUEUE_NAME}_bulk_lead`;
const delayMsPerMinute = getDelayMsPerMinute();
const isAutomationDisabled = process.env.DISABLE_AUTOMATION_WORKER === "true" || process.env.NODE_ENV === "test";
const automationProcessRole = process.env.AUTOMATION_PROCESS_ROLE ?? (process.env.NODE_ENV === "integration" ? "all" : "api");
const shouldRunAutomationWorkers = !isAutomationDisabled && (automationProcessRole === "worker" || automationProcessRole === "all");

export const automationQueue = isAutomationDisabled
  ? null
  : new Queue<ExecutionJobData>(AUTOMATION_QUEUE_NAME, { connection: redisConnection as any });
const automationBulkPrepareQueue = isAutomationDisabled
  ? null
  : new Queue<AutomationBulkPrepareJobData>(AUTOMATION_BULK_PREPARE_QUEUE_NAME, { connection: redisConnection as any });
const automationBulkLeadQueue = isAutomationDisabled
  ? null
  : new Queue<AutomationBulkLeadJobData>(AUTOMATION_BULK_LEAD_QUEUE_NAME, { connection: redisConnection as any });

export async function enqueueAutomationBulkRun(bulkJobId: string) {
  if (!automationBulkPrepareQueue) return false;
  await automationBulkPrepareQueue.add("prepare_bulk_run", { bulkJobId }, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    jobId: bulkJobId,
    removeOnComplete: true,
    removeOnFail: false,
  });
  return true;
}

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
      ...(context.causationRuleIds?.length ? { id: { notIn: context.causationRuleIds.slice(-20) } } : {}),
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

export async function reenqueueAutomationExecutionNodes(
  data: Omit<ExecutionJobData, "nodeId">,
  nodeIds: string[],
) {
  if (!automationQueue) return { ok: false as const, reason: "queue_unavailable" as const };
  const queued: string[] = [];
  const skipped: string[] = [];

  for (const nodeId of [...new Set(nodeIds)]) {
    const jobId = `${data.logId}-${nodeId}`;
    const existingJob = await automationQueue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(state)) {
        skipped.push(nodeId);
        continue;
      }
      await existingJob.remove();
    }
    await enqueueAutomationJob({ ...data, nodeId });
    queued.push(nodeId);
  }
  return { ok: true as const, queued, skipped };
}

export async function startAutomationExecution(
  rule: ExecutableAutomationRule,
  context: Omit<AutomationContext, "ruleId">,
  source: AutomationExecutionSource,
  requestedBy: string | null,
  bulkDispatchId?: string,
  executionIdempotencyKey?: string,
  retryFailedIdempotentExecution = false,
  creationAudit?: {
    userId: string;
    action: string;
    ipAddress?: string;
    newData: Record<string, unknown>;
  },
) {
  const graph = withAutomationTriggerType(rule.graphData, rule.triggerType);
  const validation = validateAutomationGraph(graph);
  if (!validation.valid) return { ok: false as const, reason: "invalid_graph" as const, validation };
  if (!automationQueue) return { ok: false as const, reason: "queue_unavailable" as const };
  const triggerNode = graph.nodes.find((node) => node.type === "trigger");
  if (!triggerNode) return { ok: false as const, reason: "invalid_graph" as const, validation };

  const version = await ensureAutomationRuleVersionSnapshot({
    ruleId: rule.id,
    version: rule.version,
    triggerType: rule.triggerType,
    graphData: graph,
    institutionProgramId: rule.institutionProgramId,
    createdBy: rule.createdBy ?? requestedBy,
  });
  const executionActorId = rule.createdBy ?? context.actorId;
  const executionContext: AutomationContext = { ...context, actorId: executionActorId, ruleId: rule.id };
  const existingLog = bulkDispatchId
    ? await prisma.automation_execution_logs.findUnique({
        where: { bulk_dispatch_id: bulkDispatchId },
        select: { id: true, status: true },
      })
    : executionIdempotencyKey
      ? await prisma.automation_execution_logs.findUnique({
          where: { id: executionIdempotencyKey },
          select: { id: true, status: true },
        })
      : null;
  if (existingLog?.status === "failed" && !retryFailedIdempotentExecution) {
    return { ok: false as const, reason: "existing_execution_failed" as const };
  }
  if (existingLog?.status === "failed" && retryFailedIdempotentExecution) {
    await prisma.automation_execution_logs.update({
      where: { id: existingLog.id },
      data: { status: "processing", error_message: null, completed_at: null, last_progress_at: new Date(), next_run_at: null },
    });
    existingLog.status = "processing";
  }
  if (existingLog?.status === "completed") {
    return { ok: true as const, data: { executionId: existingLog.id, status: existingLog.status, version: version.version, created: false } };
  }
  let log = existingLog;
  let created = false;
  if (!log) {
    try {
      log = await prisma.$transaction(async (tx) => {
        const createdLog = await tx.automation_execution_logs.create({
      data: {
        ...(executionIdempotencyKey ? { id: executionIdempotencyKey } : {}),
        rule_id: rule.id,
        rule_version_id: version.id,
        requested_by: requestedBy,
        execution_actor_id: executionActorId,
        source,
        status: "processing",
        context_data: JSON.parse(JSON.stringify(executionContext)),
        bulk_dispatch_id: bulkDispatchId,
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
        if (creationAudit) {
          await tx.audit_logs.create({
            data: {
              user_id: creationAudit.userId,
              entity_type: "automation_execution",
              entity_id: createdLog.id,
              action: creationAudit.action,
              ip_address: creationAudit.ipAddress,
              new_data: JSON.parse(JSON.stringify(creationAudit.newData)),
            },
          });
        }
        return createdLog;
      });
      created = true;
    } catch (error) {
      if (!executionIdempotencyKey || !isPrismaUniqueConstraintError(error)) throw error;
      log = await prisma.automation_execution_logs.findUnique({
        where: { id: executionIdempotencyKey },
        select: { id: true, status: true },
      });
      if (!log) throw error;
    }
  }
  try {
    for (const { nextNodeId } of getNextNodes(triggerNode.id, graph, null)) {
      await enqueueAutomationJob({ context: executionContext, nodeId: nextNodeId, graph, logId: log.id });
    }
    return { ok: true as const, data: { executionId: log.id, status: log.status, version: version.version, created } };
  } catch (error) {
    await prisma.automation_execution_logs.update({
      where: { id: log.id },
      data: { status: "failed", error_message: toErrorMessage(error), completed_at: new Date(), last_progress_at: new Date(), next_run_at: null },
    });
    throw error;
  }
}

async function processAutomationNode(job: Job<ExecutionJobData>) {
  const { context, nodeId, graph, logId } = job.data;
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new UnrecoverableError(`Không tìm thấy node ${nodeId} trong snapshot.`);

  const progressAt = new Date();
  await prisma.automation_execution_logs.updateMany({
    where: { id: logId, status: "processing" },
    data: { last_progress_at: progressAt, next_run_at: null },
  });

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
    // Valid graphs have one runtime path: trigger has one edge, other nodes cannot fan out,
    // and a condition selects exactly one handle. An execution-level next run is therefore unambiguous.
    const nextRunAt = nextNodes.length > 0 && actionResult.delayMinutes > 0
      ? new Date(Date.now() + actionResult.delayMinutes * delayMsPerMinute)
      : null;
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
          data: { status: "completed", completed_at: new Date(), error_message: null, last_progress_at: new Date(), next_run_at: null },
        });
      } else {
        await tx.automation_execution_logs.updateMany({
          where: { id: logId, status: "processing" },
          data: { last_progress_at: new Date(), next_run_at: nextRunAt },
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
        last_progress_at: new Date(),
        next_run_at: null,
      },
    });
    throw error;
  }
}

export const automationWorker = !shouldRunAutomationWorkers
  ? null
  : new Worker<ExecutionJobData>(AUTOMATION_QUEUE_NAME, processAutomationNode, {
      connection: redisConnection as any,
      concurrency: 5,
    });

const automationBulkPrepareWorker = !shouldRunAutomationWorkers
  ? null
  : new Worker<AutomationBulkPrepareJobData>(AUTOMATION_BULK_PREPARE_QUEUE_NAME, async (job) => {
      const { materializeAutomationBulkDispatches, prepareAutomationBulkLeadPage } = await import("./automation-bulk.service.js");
      await prisma.automation_jobs.update({
        where: { id: job.data.bulkJobId },
        data: { status: "processing", updated_at: new Date() },
      });
      const materializedTotal = await materializeAutomationBulkDispatches(job.data.bulkJobId, 500);
      if (materializedTotal === null) throw new UnrecoverableError("Không thể cố định tập lead cho lượt chạy hàng loạt.");
      let cursor: string | undefined;
      do {
        const page = await prepareAutomationBulkLeadPage(job.data.bulkJobId, cursor, 500);
        if (!page) throw new UnrecoverableError("Không thể đọc tập lead cho lượt chạy hàng loạt.");
        if (page.leadIds.length > 0) {
          await automationBulkLeadQueue!.addBulk(page.leadIds.map((leadId) => ({
            name: "execute_bulk_lead",
            data: { bulkJobId: job.data.bulkJobId, leadId },
            opts: {
              attempts: 3,
              backoff: { type: "exponential", delay: 5_000 },
              jobId: `${job.data.bulkJobId}-${leadId}`,
              removeOnComplete: true,
              removeOnFail: false,
            },
          })));
        }
        cursor = page.nextCursor;
        if (!page.hasMore) break;
      } while (cursor);
      const total = materializedTotal;
      const updated = await prisma.automation_jobs.update({
        where: { id: job.data.bulkJobId },
        data: {
          total_count: total,
          prepared_at: new Date(),
          updated_at: new Date(),
        },
        select: { processed_count: true, failed_count: true },
      });
      if (updated.processed_count + updated.failed_count >= total) {
        await prisma.automation_jobs.update({
          where: { id: job.data.bulkJobId },
          data: {
            status: updated.failed_count > 0 ? "completed_with_errors" : "completed",
            completed_at: new Date(),
            updated_at: new Date(),
          },
        });
      }
    }, { connection: redisConnection as any, concurrency: 1 });

const automationBulkLeadWorker = !shouldRunAutomationWorkers
  ? null
  : new Worker<AutomationBulkLeadJobData>(AUTOMATION_BULK_LEAD_QUEUE_NAME, async (job) => {
      const { executeAutomationBulkLead } = await import("./automation-bulk.service.js");
      const result = await executeAutomationBulkLead(job.data.bulkJobId, job.data.leadId);
      if (!result.ok) throw new UnrecoverableError(`Không thể chạy automation cho lead: ${result.reason}.`);
      await completeAutomationBulkDispatch(job.data.bulkJobId, job.data.leadId, false);
    }, {
      connection: redisConnection as any,
      concurrency: 5,
      limiter: { max: 100, duration: 60_000 },
    });

let slaScanTimer: NodeJS.Timeout | null = null;
if (automationWorker) {
  const scanSchedules = () => {
    void Promise.all([
      import("./automation-sla.service.js").then(({ dispatchDueSlaAutomations }) => dispatchDueSlaAutomations()),
      import("./automation-scheduler.service.js").then(({ dispatchDueScheduledAutomations }) => dispatchDueScheduledAutomations()),
      import("./automation-scheduler.service.js").then(({ dispatchExpiringAdmissionAutomations }) => dispatchExpiringAdmissionAutomations()),
    ]).catch((error) => console.error("Automation schedule scan failed", error));
  };
  scanSchedules();
  slaScanTimer = setInterval(scanSchedules, 60_000);
  slaScanTimer.unref();
}

function isPrismaUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function closeAutomationEngine() {
  if (slaScanTimer) {
    clearInterval(slaScanTimer);
    slaScanTimer = null;
  }
  await Promise.all([
    automationBulkLeadWorker?.close(),
    automationBulkPrepareWorker?.close(),
    automationWorker?.close(),
  ]);
  await Promise.all([
    automationBulkLeadQueue?.close(),
    automationBulkPrepareQueue?.close(),
    automationQueue?.close(),
    closeAutomationReassignmentQueue(),
  ]);
}

automationWorker?.on("failed", async (job, error) => {
  console.error(`Automation Job failed: ${job?.id}`, error);
  if (!job?.data.logId) return;
  const attempts = job.opts.attempts ?? 1;
  if (!(error instanceof UnrecoverableError) && job.attemptsMade < attempts) return;
  await prisma.automation_execution_logs.update({
    where: { id: job.data.logId },
    data: { status: "failed", error_message: toErrorMessage(error), completed_at: new Date(), last_progress_at: new Date(), next_run_at: null },
  }).catch((updateError) => console.error("Không thể cập nhật execution log thất bại", updateError));
});

automationBulkPrepareWorker?.on("failed", async (job, error) => {
  if (!job || (!(error instanceof UnrecoverableError) && job.attemptsMade < (job.opts.attempts ?? 1))) return;
  await prisma.automation_jobs.update({
    where: { id: job.data.bulkJobId },
    data: { status: "failed", error_message: toErrorMessage(error), completed_at: new Date(), updated_at: new Date() },
  }).catch((updateError) => console.error("Không thể cập nhật bulk job thất bại", updateError));
});

automationBulkLeadWorker?.on("failed", async (job, error) => {
  if (!job || (!(error instanceof UnrecoverableError) && job.attemptsMade < (job.opts.attempts ?? 1))) return;
  console.error(`Automation bulk lead job failed: ${job.id}`, error);
  await completeAutomationBulkDispatch(job.data.bulkJobId, job.data.leadId, true, toErrorMessage(error));
});

async function completeAutomationBulkDispatch(bulkJobId: string, leadId: string, failed: boolean, errorMessage?: string) {
  await prisma.$transaction(async (tx) => {
    const completed = await tx.automation_bulk_dispatches.updateMany({
      where: { bulk_job_id: bulkJobId, lead_id: leadId, status: { notIn: ["dispatched", "failed"] } },
      data: { status: failed ? "failed" : "dispatched", error_message: errorMessage ?? null, updated_at: new Date() },
    });
    if (completed.count === 0) return;
    const updated = await tx.automation_jobs.update({
      where: { id: bulkJobId },
      data: {
        ...(failed ? { failed_count: { increment: 1 } } : { processed_count: { increment: 1 } }),
        ...(errorMessage ? { error_message: errorMessage } : {}),
        updated_at: new Date(),
      },
      select: { total_count: true, processed_count: true, failed_count: true, prepared_at: true },
    });
    if (updated.prepared_at && updated.processed_count + updated.failed_count >= updated.total_count) {
      await tx.automation_jobs.update({
        where: { id: bulkJobId },
        data: {
          status: updated.failed_count > 0 ? "completed_with_errors" : "completed",
          completed_at: new Date(),
          updated_at: new Date(),
        },
      });
    }
  });
}

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
