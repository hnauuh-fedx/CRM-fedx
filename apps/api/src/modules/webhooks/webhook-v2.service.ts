import { createHash, randomUUID } from "node:crypto";

import { compare } from "bcryptjs";
import { Prisma } from "../../generated/prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../database/prisma";
import { getAuthUser } from "../auth/auth.service";
import { applyInboundLeadMutation } from "../leads/lead-inbound.service";
import type { LeadInput } from "../leads/lead-management.service";
import { classifyWebhookError, WebhookProcessingError } from "./webhook-errors";
import { incrementWebhookMetric, observeWebhookDuration } from "./webhook-metrics";
import { enqueueInboundWebhookRequest } from "./webhook-queue.service";
import type { WebhookRateLimiter } from "./webhook-rate-limit.service";
import {
  getAllowedFieldMetadata,
  mapWebhookPayload,
  ProcessFailure,
  toJson,
  type FieldMetadata,
  type JsonObject,
} from "./webhook.service";
import type { WebhookDuplicatePolicy } from "./webhook.types";

type MappingSnapshot = {
  incoming_key: string;
  crm_field: string;
  is_required: boolean;
  default_value: string | null;
};

export type WebhookConfigSnapshot = {
  version: 1;
  institutionProgramId: string;
  targetModule: string;
  duplicatePolicy: WebhookDuplicatePolicy;
  actorId: string;
  webhookName?: string;
  mappings: MappingSnapshot[];
  fields: FieldMetadata[];
};

export type IngestWebhookResult =
  | { ok: true; status: 202; data: { request_id: string; status: string; duplicate?: true } }
  | { ok: false; status: number; error: { code: string; message: string }; retryAfterSeconds?: number };

export type ProcessingFault = "after_processing" | "before_success_commit";

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprintWebhookPayload(payload: unknown) {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

function publicStatus(status: string) {
  return status.toLowerCase();
}

export async function enqueuePersistedRequest(requestId: string, fault?: "after_claim") {
  const claimed = await prisma.webhook_requests.updateMany({
    where: { request_id: requestId, status: { in: ["RECEIVED", "QUEUE_FAILED", "RETRYING"] } },
    data: { status: "QUEUED", queued_at: null, error_code: null, error_message: null, last_error_category: null },
  });
  if (claimed.count === 0) {
    const current = await prisma.webhook_requests.findUnique({
      where: { request_id: requestId },
      select: { status: true, queued_at: true },
    });
    if (!current || current.status !== "QUEUED" || current.queued_at) return true;
  }
  if (fault === "after_claim") throw new Error("Injected crash after queue claim");
  try {
    const job = await enqueueInboundWebhookRequest(requestId);
    await prisma.webhook_requests.updateMany({
      where: { request_id: requestId, status: "QUEUED" },
      data: { queued_at: new Date() },
    });
    incrementWebhookMetric("webhook_accepted_total");
    console.info(JSON.stringify({ event: "inbound_webhook_queued", requestId, queueJobId: job.id ?? `webhook-request-${requestId}`, status: "QUEUED" }));
    return true;
  } catch (error) {
    await prisma.webhook_requests.updateMany({
      where: { request_id: requestId, status: "QUEUED" },
      data: {
        status: "QUEUE_FAILED",
        error_code: "QUEUE_UNAVAILABLE",
        error_message: "Không thể đưa yêu cầu vào hàng đợi.",
        last_error_category: "INFRASTRUCTURE",
        processed_at: new Date(),
      },
    });
    incrementWebhookMetric("webhook_queue_enqueue_failed_total");
    console.warn(JSON.stringify({ event: "inbound_webhook_enqueue_failed", requestId, status: "QUEUE_FAILED", errorType: error instanceof Error ? error.name : "UnknownError" }));
    return false;
  }
}

export async function ingestInboundWebhook(
  webhookKey: string,
  secret: string | undefined,
  payload: unknown,
  idempotencyKey: string | undefined,
  rateLimiter: WebhookRateLimiter,
  ipAddress?: string,
): Promise<IngestWebhookResult> {
  const webhook = await prisma.webhooks.findUnique({
    where: { webhook_key: webhookKey },
    include: { field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] } },
  });
  if (!webhook) return { ok: false, status: 404, error: { code: "WEBHOOK_NOT_FOUND", message: "Không tìm thấy webhook." } };

  incrementWebhookMetric("webhook_received_total", { target_module: webhook.target_module });
  let rateLimit;
  try {
    rateLimit = await rateLimiter(webhook.id);
  } catch {
    return { ok: false, status: 503, error: { code: "RATE_LIMITER_UNAVAILABLE", message: "Dịch vụ webhook tạm thời không khả dụng." } };
  }
  if (!rateLimit.allowed) {
    return { ok: false, status: 429, retryAfterSeconds: rateLimit.retryAfterSeconds, error: { code: "RATE_LIMITED", message: "Webhook đã vượt quá giới hạn request/phút." } };
  }
  if (webhook.status !== "ACTIVE") return { ok: false, status: 403, error: { code: "WEBHOOK_DISABLED", message: "Webhook đang bị tắt." } };
  if (!secret || !(await compare(secret, webhook.secret_hash))) {
    return { ok: false, status: 401, error: { code: "INVALID_SECRET", message: "Webhook secret không hợp lệ." } };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: { code: "INVALID_JSON", message: "Payload phải là một JSON object hợp lệ." } };
  }

  const payloadHash = fingerprintWebhookPayload(payload);
  const normalizedKey = idempotencyKey?.trim() || null;
  const requestId = randomUUID();
  const fields = await getAllowedFieldMetadata(webhook.institution_program_id);
  const snapshot: WebhookConfigSnapshot = {
    version: 1,
    institutionProgramId: webhook.institution_program_id,
    targetModule: webhook.target_module,
    duplicatePolicy: webhook.duplicate_policy as WebhookDuplicatePolicy,
    actorId: webhook.created_by,
    webhookName: webhook.name,
    mappings: webhook.field_mappings,
    fields,
  };

  try {
    await prisma.$transaction([
      prisma.webhook_requests.create({
        data: {
          webhook_id: webhook.id,
          request_id: requestId,
          idempotency_key: normalizedKey,
          payload_hash: payloadHash,
          source_ip: ipAddress,
          status: "RECEIVED",
          action: "FAILED",
          payload: toJson(payload),
          config_snapshot: snapshot as unknown as Prisma.InputJsonValue,
          max_attempts: env.WEBHOOK_MAX_ATTEMPTS,
          received_at: new Date(),
        },
      }),
      prisma.webhooks.update({ where: { id: webhook.id }, data: { last_received_at: new Date() } }),
    ]);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || !normalizedKey) throw error;
    const existing = await prisma.webhook_requests.findUnique({
      where: { webhook_id_idempotency_key: { webhook_id: webhook.id, idempotency_key: normalizedKey } },
      select: { request_id: true, payload_hash: true, status: true },
    });
    if (!existing) throw error;
    if (existing.payload_hash !== payloadHash) {
      return { ok: false, status: 409, error: { code: "IDEMPOTENCY_KEY_CONFLICT", message: "Idempotency key đã được dùng với payload khác." } };
    }
    incrementWebhookMetric("webhook_idempotent_duplicate_total");
    const enqueued = ["RECEIVED", "QUEUE_FAILED", "QUEUED"].includes(existing.status)
      ? await enqueuePersistedRequest(existing.request_id)
      : true;
    if (!enqueued) {
      return { ok: false, status: 503, error: { code: "QUEUE_UNAVAILABLE", message: "YÃªu cáº§u Ä‘Ã£ Ä‘Æ°á»£c lÆ°u vÃ  sáº½ Ä‘Æ°á»£c khÃ´i phá»¥c; vui lÃ²ng gá»­i láº¡i sau." } };
    }
    const current = await prisma.webhook_requests.findUniqueOrThrow({ where: { request_id: existing.request_id }, select: { status: true } });
    return { ok: true, status: 202, data: { request_id: existing.request_id, status: publicStatus(current.status), duplicate: true } };
  }

  const queued = await enqueuePersistedRequest(requestId);
  if (!queued) return { ok: false, status: 503, error: { code: "QUEUE_UNAVAILABLE", message: "Yêu cầu đã được lưu và sẽ được khôi phục; vui lòng gửi lại sau." } };
  return { ok: true, status: 202, data: { request_id: requestId, status: "accepted" } };
}

function processingErrorFromFailure(error: ProcessFailure) {
  const category = error.code === "DUPLICATE_RECORD" ? "BUSINESS" : "VALIDATION";
  return new WebhookProcessingError(error.code, error.message, category, false);
}

async function finishFailure(
  requestId: string,
  requestDbId: string,
  attemptId: string,
  attemptNumber: number,
  cycleAttemptNumber: number,
  startedAt: number,
  error: WebhookProcessingError,
) {
  const now = new Date();
  const duration = Math.max(0, Date.now() - startedAt);
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-request:${requestId}`}, 0)) IS NULL AS locked`;
    const request = await tx.webhook_requests.findUniqueOrThrow({
      where: { id: requestDbId },
      select: { status: true, attempt_count: true, max_attempts: true },
    });
    if (request.status !== "PROCESSING" || request.attempt_count !== attemptNumber) {
      await tx.webhook_request_attempts.updateMany({
        where: { id: attemptId, status: "PROCESSING" },
        data: { status: "SKIPPED", finished_at: now, duration_ms: duration },
      });
      return { status: "SUPERSEDED", retry: false } as const;
    }
    const exhausted = cycleAttemptNumber >= request.max_attempts;
    const status = error.retryable ? (exhausted ? "DEAD_LETTER" : "RETRYING") : "FAILED";
    const responseCode = error.code === "DUPLICATE_RECORD" ? 409 : error.category === "VALIDATION" ? 400 : 422;
    const nextRetryAt = status === "RETRYING" ? new Date(Date.now() + 30_000 * 2 ** Math.max(0, cycleAttemptNumber - 1)) : null;
    await tx.webhook_request_attempts.update({
      where: { id: attemptId },
      data: { status, error_code: error.code, error_message: error.message, error_category: error.category, finished_at: now, duration_ms: duration },
    });
    await tx.webhook_requests.update({
      where: { id: requestDbId },
      data: {
        status,
        action: error.code === "DUPLICATE_RECORD" ? "REJECTED" : "FAILED",
        response_code: error.retryable ? 500 : responseCode,
        error_code: error.code,
        error_message: error.message,
        last_error_category: error.category,
        next_retry_at: nextRetryAt,
        processed_at: now,
        completed_at: status === "FAILED" ? now : null,
        dead_lettered_at: status === "DEAD_LETTER" ? now : null,
        processing_time_ms: duration,
      },
    });
    return { status, retry: status === "RETRYING" } as const;
  });
  if (outcome.status === "SUPERSEDED") return { ...outcome, error };
  const status = outcome.status;
  incrementWebhookMetric(status === "RETRYING" ? "webhook_retry_total" : status === "DEAD_LETTER" ? "webhook_dead_letter_total" : "webhook_processing_failed_total", { error_category: error.category });
  return { ...outcome, error };
}

export async function processInboundWebhookRequest(
  requestId: string,
  options: { workerId?: string; fault?: ProcessingFault; afterClaim?: () => Promise<void> } = {},
) {
  const startedAt = Date.now();
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-request:${requestId}`}, 0)) IS NULL AS locked`;
    const request = await tx.webhook_requests.findUnique({ where: { request_id: requestId } });
    if (!request) return { kind: "missing" as const };
    if (["SUCCEEDED", "FAILED", "DEAD_LETTER"].includes(request.status)) return { kind: "terminal" as const, status: request.status };
    if (request.status === "PROCESSING") return { kind: "busy" as const };
    const processingStartedAt = new Date();
    const attemptNumber = request.attempt_count + 1;
    const cycleAttemptNumber = request.cycle_attempt_count + 1;
    const attempt = await tx.webhook_request_attempts.create({
      data: { request_id: request.id, attempt_number: attemptNumber, status: "PROCESSING", worker_id: options.workerId },
      select: { id: true },
    });
    await tx.webhook_requests.update({
      where: { id: request.id },
      data: { status: "PROCESSING", attempt_count: attemptNumber, cycle_attempt_count: cycleAttemptNumber, last_attempt_at: processingStartedAt, processing_started_at: processingStartedAt, next_retry_at: null },
    });
    return { kind: "claimed" as const, request, attemptId: attempt.id, attemptNumber, cycleAttemptNumber, processingStartedAt };
  });
  if (claimed.kind !== "claimed") return { status: claimed.kind === "terminal" ? claimed.status : claimed.kind.toUpperCase(), retry: false };

  const { request, attemptId, attemptNumber, cycleAttemptNumber, processingStartedAt } = claimed;
  incrementWebhookMetric("webhook_processing_total");
  try {
    await options.afterClaim?.();
    if (options.fault === "after_processing") throw new Error("Injected fault after PROCESSING");
    const snapshot = request.config_snapshot as unknown as WebhookConfigSnapshot;
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.mappings)) {
      throw new WebhookProcessingError("MALFORMED_STORED_REQUEST", "Yêu cầu đã lưu không có cấu hình hợp lệ.", "VALIDATION", false);
    }
    const payload = request.payload as JsonObject;
    let mapping;
    try {
      mapping = await mapWebhookPayload(snapshot.institutionProgramId, payload, snapshot.mappings, snapshot.fields);
    } catch (error) {
      if (error instanceof ProcessFailure) throw processingErrorFromFailure(error);
      throw error;
    }
    const actor = await getAuthUser(snapshot.actorId);
    if (!actor) throw new WebhookProcessingError("WEBHOOK_ACTOR_NOT_FOUND", "Không thể xác định người tạo webhook.", "BUSINESS", false);
    if (mapping.leadValues.phone === undefined) throw new WebhookProcessingError("MISSING_REQUIRED_FIELD", "Chưa có số điện thoại để nhận diện Lead trùng.", "VALIDATION", false);
    const missingCreateFields = [...mapping.missingRequiredIncoming, ...mapping.missingRequiredCrm];
    const leadInput = {
      ...mapping.leadValues,
      ...(mapping.leadValues.graduationYear !== undefined ? { graduationYear: String(mapping.leadValues.graduationYear) } : {}),
      ...(mapping.leadValues.monthlyRevenue !== undefined ? { monthlyRevenue: String(mapping.leadValues.monthlyRevenue) } : {}),
      fullName: String(mapping.leadValues.fullName ?? ""),
      phone: String(mapping.leadValues.phone),
      sourceId: String(mapping.leadValues.sourceId ?? ""),
      institutionProgramId: snapshot.institutionProgramId,
    } as unknown as LeadInput;
    const result = await applyInboundLeadMutation({
      actor,
      institutionProgramId: snapshot.institutionProgramId,
      duplicatePolicy: snapshot.duplicatePolicy,
      leadInput,
      originName: mapping.originName,
      sourceOccurrence: mapping.originName ? {
        webhookId: request.webhook_id,
        requestId,
        sourceName: mapping.sourceName && mapping.sourceName.toLocaleLowerCase("vi") !== mapping.originName?.toLocaleLowerCase("vi")
          ? mapping.sourceName
          : snapshot.webhookName ?? "Webhook",
        note: typeof mapping.mapped.note === "string" ? mapping.mapped.note : undefined,
        details: toJson(mapping.mapped),
        receivedAt: request.received_at,
      } : undefined,
      providedFields: mapping.providedFields,
      customFieldValues: mapping.customFieldValues,
      canCreate: missingCreateFields.length === 0,
      ipAddress: request.source_ip ?? undefined,
      beforeMutation: async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-request:${requestId}`}, 0)) IS NULL AS locked`;
        const current = await tx.webhook_requests.findUnique({
          where: { id: request.id },
          select: { status: true, attempt_count: true },
        });
        return current?.status === "PROCESSING" && current.attempt_count === attemptNumber;
      },
      onCompleted: async (tx, completed) => {
        if (options.fault === "before_success_commit") throw new Error("Injected fault before success commit");
        const now = new Date();
        const duration = Math.max(0, Date.now() - startedAt);
        await tx.webhook_requests.update({
          where: { id: request.id },
          data: {
            status: "SUCCEEDED",
            action: completed.action,
            mapped_payload: toJson(mapping.mapped),
            response_code: 200,
            record_id: completed.recordId,
            duplicate_record_id: completed.action === "UPDATED" ? completed.recordId : null,
            error_code: null,
            error_message: null,
            last_error_category: null,
            processing_time_ms: duration,
            processed_at: now,
            completed_at: now,
          },
        });
        await tx.webhook_request_attempts.update({ where: { id: attemptId }, data: { status: "SUCCEEDED", finished_at: now, duration_ms: duration } });
      },
    });
    if (!result.ok) {
      if (result.reason === "superseded") {
        await prisma.webhook_request_attempts.updateMany({
          where: { id: attemptId, status: "PROCESSING" },
          data: { status: "SKIPPED", finished_at: new Date(), duration_ms: Math.max(0, Date.now() - startedAt) },
        });
        return { status: "SUPERSEDED", retry: false };
      }
      const code = result.reason === "duplicate" ? "DUPLICATE_RECORD" : result.reason === "missing_create_fields" ? "MISSING_REQUIRED_FIELD" : result.reason === "custom_field_invalid" ? "INVALID_FIELD_VALUE" : "RECORD_CREATE_FAILED";
      if (result.reason === "duplicate") {
        await prisma.webhook_requests.update({ where: { id: request.id }, data: { duplicate_record_id: result.duplicateRecordId } });
      }
      throw new WebhookProcessingError(code, code === "DUPLICATE_RECORD" ? "Đã tồn tại Lead trùng trong chương trình này." : "Không thể xử lý Lead từ payload webhook.", code === "DUPLICATE_RECORD" ? "BUSINESS" : "VALIDATION", false);
    }
    const duration = Math.max(0, Date.now() - startedAt);
    incrementWebhookMetric("webhook_processing_success_total", { action: result.action, target_module: snapshot.targetModule });
    observeWebhookDuration("webhook_processing_duration", duration, { action: result.action });
    observeWebhookDuration("webhook_queue_wait_duration", Math.max(0, processingStartedAt.getTime() - (request.queued_at ?? request.received_at).getTime()), { target_module: snapshot.targetModule });
    console.info(JSON.stringify({ event: "inbound_webhook_processed", requestId, webhookId: request.webhook_id, institutionProgramId: snapshot.institutionProgramId, queueJobId: `webhook-request-${requestId}`, attempt: attemptNumber, status: "SUCCEEDED", action: result.action, processingTimeMs: duration }));
    return { status: "SUCCEEDED", retry: false, recordId: result.recordId, action: result.action };
  } catch (error) {
    const classified = classifyWebhookError(error);
    const result = await finishFailure(requestId, request.id, attemptId, attemptNumber, cycleAttemptNumber, startedAt, classified);
    console.error(JSON.stringify({ event: "inbound_webhook_processing_failed", requestId, webhookId: request.webhook_id, queueJobId: `webhook-request-${requestId}`, attempt: attemptNumber, status: result.status, errorCode: classified.code, errorCategory: classified.category, errorType: error instanceof Error ? error.name : "UnknownError" }));
    return result;
  }
}
