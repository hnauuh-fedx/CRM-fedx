import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";

import { isRedisDisabled, redisConnection } from "../../config/redis";
import { prisma } from "../../database/prisma";
import { processReassignmentExpiry, processReassignmentWarning } from "./automation-reassignment.service";

type ReassignmentJobData = {
  monitorId: string;
  kind: "warning" | "expiry";
};

const DEFAULT_AUTOMATION_QUEUE_NAME = "automation_engine_queue";
const QUEUE_NAME = `${getAutomationQueueName()}_reassignment`;
const automationDisabled = isRedisDisabled || process.env.DISABLE_AUTOMATION_WORKER === "true" || process.env.NODE_ENV === "test";
const automationProcessRole = process.env.AUTOMATION_PROCESS_ROLE ?? (process.env.NODE_ENV === "integration" ? "all" : "api");
const shouldRunWorker = !automationDisabled && (automationProcessRole === "worker" || automationProcessRole === "all");

function getAutomationQueueName() {
  if (process.env.NODE_ENV !== "integration") return DEFAULT_AUTOMATION_QUEUE_NAME;
  const queueName = process.env.AUTOMATION_QUEUE_NAME?.trim() || DEFAULT_AUTOMATION_QUEUE_NAME;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(queueName)) {
    throw new Error("AUTOMATION_QUEUE_NAME integration phải gồm 1-100 ký tự chữ, số, gạch dưới hoặc gạch ngang.");
  }
  return queueName;
}

export const automationReassignmentQueue = automationDisabled
  ? null
  : new Queue<ReassignmentJobData>(QUEUE_NAME, { connection: redisConnection as any });

async function addJob(data: ReassignmentJobData, runAt: Date) {
  if (!automationReassignmentQueue) return false;
  const jobId = `${data.monitorId}-${data.kind}`;
  const existing = await automationReassignmentQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(state)) return true;
    await existing.remove();
  }
  await automationReassignmentQueue.add(`reassignment_${data.kind}`, data, {
    delay: Math.max(0, runAt.getTime() - Date.now()),
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    jobId,
    removeOnComplete: true,
    removeOnFail: false,
  });
  return true;
}

export async function enqueueReassignmentMonitorJobs(monitorId: string) {
  const monitor = await prisma.automation_reassignment_monitors.findUnique({
    where: { id: monitorId },
    select: { status: true, warning_due_at: true, warned_at: true, reassignment_due_at: true },
  });
  if (!monitor || !["pending", "warned"].includes(monitor.status)) return false;
  if (monitor.warning_due_at && !monitor.warned_at) {
    await addJob({ monitorId, kind: "warning" }, monitor.warning_due_at);
  }
  await addJob({ monitorId, kind: "expiry" }, monitor.reassignment_due_at);
  return true;
}

async function processJob(job: Job<ReassignmentJobData>) {
  if (job.data.kind === "warning") return processReassignmentWarning(job.data.monitorId);
  return processReassignmentExpiry(job.data.monitorId);
}

const reassignmentWorker = shouldRunWorker
  ? new Worker<ReassignmentJobData>(QUEUE_NAME, processJob, { connection: redisConnection as any, concurrency: 5 })
  : null;

export async function recoverDueReassignmentMonitors(now = new Date(), limit = 500) {
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  const stale = await prisma.automation_reassignment_monitors.findMany({
    where: { status: "processing", claimed_at: { lte: staleBefore } },
    select: { id: true, warned_at: true },
    take: limit,
  });
  for (const monitor of stale) {
    await prisma.automation_reassignment_monitors.updateMany({
      where: { id: monitor.id, status: "processing", claimed_at: { lte: staleBefore } },
      data: { status: monitor.warned_at ? "warned" : "pending", claimed_at: null, updated_at: now },
    });
  }
  const due = await prisma.automation_reassignment_monitors.findMany({
    where: {
      status: { in: ["pending", "warned"] },
      OR: [
        { warning_due_at: { lte: now }, warned_at: null },
        { reassignment_due_at: { lte: now } },
      ],
    },
    select: { id: true },
    orderBy: [{ reassignment_due_at: "asc" }, { id: "asc" }],
    take: limit,
  });
  for (const monitor of due) await enqueueReassignmentMonitorJobs(monitor.id);
  return { recovered: stale.length, enqueued: due.length };
}

let recoveryTimer: NodeJS.Timeout | null = null;
if (reassignmentWorker) {
  const recover = () => void recoverDueReassignmentMonitors()
    .catch((error) => console.error("Không thể phục hồi job chuyển Sale", error));
  recover();
  recoveryTimer = setInterval(recover, 60_000);
  recoveryTimer.unref();
}

reassignmentWorker?.on("failed", async (job, error) => {
  if (!job || (!(error instanceof UnrecoverableError) && job.attemptsMade < (job.opts.attempts ?? 1))) return;
  await prisma.automation_reassignment_monitors.updateMany({
    where: { id: job.data.monitorId, status: { in: ["pending", "warned", "processing"] } },
    data: { status: "failed", completion_reason: "job_failed", last_error: error.message, processed_at: new Date(), updated_at: new Date() },
  }).catch((updateError) => console.error("Không thể cập nhật monitor chuyển Sale thất bại", updateError));
});

export async function closeAutomationReassignmentQueue() {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
  await reassignmentWorker?.close();
  await automationReassignmentQueue?.close();
}
