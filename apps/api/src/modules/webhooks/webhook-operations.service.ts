import { Prisma } from "../../generated/prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { incrementWebhookMetric } from "./webhook-metrics";
import { getWebhookQueueAdapter } from "./webhook-queue.service";
import { enqueuePersistedRequest, type WebhookConfigSnapshot } from "./webhook-v2.service";
import { getAllowedFieldMetadata } from "./webhook.service";
import type { WebhookDuplicatePolicy } from "./webhook.types";

async function currentSnapshot(webhookId: string): Promise<WebhookConfigSnapshot | null> {
  const webhook = await prisma.webhooks.findUnique({
    where: { id: webhookId },
    include: { field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] } },
  });
  if (!webhook) return null;
  return {
    version: 1,
    institutionProgramId: webhook.institution_program_id,
    targetModule: webhook.target_module,
    duplicatePolicy: webhook.duplicate_policy as WebhookDuplicatePolicy,
    actorId: webhook.created_by,
    mappings: webhook.field_mappings,
    fields: await getAllowedFieldMetadata(webhook.institution_program_id),
  };
}

export async function reprocessWebhookRequest(
  user: AuthUser,
  programId: string,
  webhookId: string,
  requestDbId: string,
  ipAddress?: string,
) {
  const request = await prisma.webhook_requests.findFirst({
    where: { id: requestDbId, webhook_id: webhookId, webhooks: { institution_program_id: programId } },
    select: { id: true, request_id: true, status: true },
  });
  if (!request) return { ok: false as const, reason: "not_found" as const };
  if (!["FAILED", "DEAD_LETTER", "QUEUE_FAILED"].includes(request.status)) return { ok: false as const, reason: "invalid_status" as const };
  const snapshot = await currentSnapshot(webhookId);
  if (!snapshot) return { ok: false as const, reason: "not_found" as const };
  await prisma.$transaction([
    prisma.webhook_requests.update({
      where: { id: request.id },
      data: {
        status: "RECEIVED",
        cycle_attempt_count: 0,
        config_snapshot: snapshot as unknown as Prisma.InputJsonValue,
        error_code: null,
        error_message: null,
        last_error_category: null,
        next_retry_at: null,
        completed_at: null,
        dead_lettered_at: null,
        reprocessed_count: { increment: 1 },
      },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "webhook_request",
        entity_id: request.id,
        action: "manual_reprocess",
        old_data: { status: request.status },
        new_data: { status: "RECEIVED", requestId: request.request_id, configuration: "current" },
        ip_address: ipAddress,
      },
    }),
  ]);
  const queued = await enqueuePersistedRequest(request.request_id);
  incrementWebhookMetric("webhook_manual_reprocess_total");
  return queued
    ? { ok: true as const, requestId: request.request_id, status: "QUEUED" }
    : { ok: false as const, reason: "queue_unavailable" as const, requestId: request.request_id };
}

export async function recoverWebhookQueue() {
  const staleBefore = new Date(Date.now() - env.WEBHOOK_PROCESSING_STALE_SECONDS * 1000);
  const stale = await prisma.webhook_requests.findMany({
    where: { status: "PROCESSING", processing_started_at: { lt: staleBefore } },
    select: { id: true, request_id: true },
    take: 500,
  });
  for (const request of stale) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-request:${request.request_id}`}, 0)) IS NULL AS locked`;
      const current = await tx.webhook_requests.findUnique({
        where: { id: request.id },
        select: { status: true, processing_started_at: true, cycle_attempt_count: true, max_attempts: true },
      });
      if (current?.status !== "PROCESSING" || !current.processing_started_at || current.processing_started_at >= staleBefore) return;
      const exhausted = current.cycle_attempt_count >= current.max_attempts;
      const status = exhausted ? "DEAD_LETTER" : "RETRYING";
      const now = new Date();
      await tx.webhook_requests.update({
        where: { id: request.id },
        data: { status, next_retry_at: exhausted ? null : now, completed_at: exhausted ? now : null, dead_lettered_at: exhausted ? now : null, error_code: "STALE_PROCESSING", error_message: "Worker không hoàn tất trong thời gian cho phép.", last_error_category: "INFRASTRUCTURE" },
      });
      await tx.webhook_request_attempts.updateMany({
        where: { request_id: request.id, status: "PROCESSING" },
        data: { status, error_code: "STALE_PROCESSING", error_message: "Worker không hoàn tất trong thời gian cho phép.", error_category: "INFRASTRUCTURE", finished_at: now },
      });
    });
  }
  const candidates = await prisma.webhook_requests.findMany({
    where: {
      OR: [
        { status: { in: ["RECEIVED", "QUEUE_FAILED"] } },
        { status: "QUEUED", queued_at: null },
        { status: "RETRYING", OR: [{ next_retry_at: null }, { next_retry_at: { lte: new Date() } }] },
      ],
    },
    orderBy: { received_at: "asc" },
    select: { request_id: true },
    take: 500,
  });
  const queue = getWebhookQueueAdapter();
  let recovered = 0;
  let failed = 0;
  for (const candidate of candidates) {
    if (queue && await queue.has(candidate.request_id)) continue;
    if (await enqueuePersistedRequest(candidate.request_id)) recovered += 1;
    else failed += 1;
  }
  return { stale: stale.length, candidates: candidates.length, recovered, failed };
}

export async function getWebhookOperationalStatus(programId: string) {
  const now = new Date();
  const pendingStatuses = ["RECEIVED", "QUEUE_FAILED", "QUEUED", "RETRYING"];
  const [grouped, attemptGroups, durations, backlog, succeededLastMinute] = await Promise.all([
    prisma.webhook_requests.groupBy({
      by: ["status"],
      where: { webhooks: { institution_program_id: programId } },
      _count: { _all: true },
    }),
    prisma.webhook_request_attempts.groupBy({
      by: ["status"],
      where: { request: { webhooks: { institution_program_id: programId } } },
      _count: { _all: true },
    }),
    prisma.webhook_request_attempts.aggregate({
      where: { request: { webhooks: { institution_program_id: programId } }, duration_ms: { not: null } },
      _count: { duration_ms: true },
      _sum: { duration_ms: true },
      _max: { duration_ms: true },
    }),
    prisma.webhook_requests.aggregate({
      where: { webhooks: { institution_program_id: programId }, status: { in: pendingStatuses } },
      _count: { id: true },
      _min: { received_at: true },
    }),
    prisma.webhook_requests.count({
      where: { webhooks: { institution_program_id: programId }, status: "SUCCEEDED", completed_at: { gte: new Date(now.getTime() - 60_000) } },
    }),
  ]);
  const queue = getWebhookQueueAdapter();
  let queueAvailable = false;
  if (queue) {
    try {
      await queue.counts();
      queueAvailable = true;
    } catch {
      queueAvailable = false;
    }
  }
  return {
    queue: {
      available: queueAvailable,
      durableDepth: backlog._count.id,
      oldestPendingAt: backlog._min.received_at?.toISOString() ?? null,
      lagMs: backlog._min.received_at ? Math.max(0, now.getTime() - backlog._min.received_at.getTime()) : 0,
    },
    requests: Object.fromEntries(grouped.map((item) => [item.status, item._count._all])),
    attempts: Object.fromEntries(attemptGroups.map((item) => [item.status, item._count._all])),
    processingDuration: {
      count: durations._count.duration_ms,
      totalMs: durations._sum.duration_ms ?? 0,
      maxMs: durations._max.duration_ms ?? 0,
    },
    throughput: { succeededLastMinute },
  };
}
