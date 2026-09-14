import { randomBytes, randomUUID } from "node:crypto";

import { compare, hash } from "bcryptjs";

import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getAuthUser } from "../auth/auth.service";
import { createLead, type LeadInput } from "../leads/lead-management.service";
import {
  webhookFieldMetadata,
  type WebhookErrorCode,
  type WebhookFieldType,
  type WebhookInput,
  type WebhookProcessResult,
} from "./webhook.types";

type JsonObject = Record<string, unknown>;
type FieldMetadata = { key: string; label: string; type: WebhookFieldType; requiredByCrm: boolean };
type ProcessWebhookRecord = {
  id: string;
  institution_program_id: string;
  created_by: string;
  secret_hash: string;
  status: string;
  field_mappings: Array<{ incoming_key: string; crm_field: string; is_required: boolean; default_value: string | null }>;
};

const metadataByKey = new Map<string, FieldMetadata>(webhookFieldMetadata.map((field) => [field.key, field]));
const sensitiveKeys = /^(authorization|x-webhook-secret|password|password_hash|secret|token|access_token|refresh_token)$/i;

function generateWebhookKey() {
  return randomBytes(24).toString("base64url");
}

function generateSecret() {
  return randomBytes(32).toString("base64url");
}

function publicWebhookPath(key: string) {
  return `/api/webhooks/${key}`;
}

function serializeWebhook(webhook: {
  id: string;
  name: string;
  target_module: string;
  webhook_key: string;
  status: string;
  last_received_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: webhook.id,
    name: webhook.name,
    targetModule: webhook.target_module,
    webhookKey: webhook.webhook_key,
    webhookUrl: publicWebhookPath(webhook.webhook_key),
    status: webhook.status,
    lastReceivedAt: formatDate(webhook.last_received_at),
    createdAt: webhook.created_at.toISOString(),
    updatedAt: webhook.updated_at.toISOString(),
  };
}

function serializeMapping(mapping: {
  id: string;
  incoming_key: string;
  crm_field: string;
  is_required: boolean;
  default_value: string | null;
}) {
  return {
    id: mapping.id,
    incomingKey: mapping.incoming_key,
    crmField: mapping.crm_field,
    isRequired: mapping.is_required,
    defaultValue: mapping.default_value,
  };
}

function formatDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

function sanitizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, child]) => [key, sensitiveKeys.test(key) ? "[REDACTED]" : sanitizeJson(child)]),
  );
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

export function getWebhookFieldMetadata() {
  return { targetModules: [{ value: "LEAD", label: "Lead" }], fields: webhookFieldMetadata };
}

export async function listWebhooks(programId: string, query: { page: number; limit: number }) {
  const where = { institution_program_id: programId };
  const [items, total] = await prisma.$transaction([
    prisma.webhooks.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.webhooks.count({ where }),
  ]);
  return {
    data: items.map(serializeWebhook),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function getWebhook(programId: string, webhookId: string) {
  const webhook = await prisma.webhooks.findFirst({
    where: { id: webhookId, institution_program_id: programId },
    include: { field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] } },
  });
  if (!webhook) return null;
  return { ...serializeWebhook(webhook), mappings: webhook.field_mappings.map(serializeMapping) };
}

export async function createWebhook(user: AuthUser, programId: string, input: WebhookInput, ipAddress?: string) {
  const secret = generateSecret();
  const secretHash = await hash(secret, 12);
  const webhook = await prisma.$transaction(async (tx) => {
    const created = await tx.webhooks.create({
      data: {
        institution_program_id: programId,
        name: input.name,
        target_module: input.targetModule,
        webhook_key: generateWebhookKey(),
        secret_hash: secretHash,
        status: input.status,
        created_by: user.id,
        field_mappings: { create: input.mappings.map((mapping) => ({ incoming_key: mapping.incomingKey, crm_field: mapping.crmField, is_required: mapping.isRequired, default_value: mapping.defaultValue || null })) },
      },
      include: { field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] } },
    });
    await tx.audit_logs.create({ data: { user_id: user.id, entity_type: "webhook", entity_id: created.id, action: "create", ip_address: ipAddress, new_data: { name: input.name, targetModule: input.targetModule, status: input.status, institutionProgramId: programId } } });
    return created;
  });
  return { ...serializeWebhook(webhook), mappings: webhook.field_mappings.map(serializeMapping), secret };
}

export async function updateWebhook(user: AuthUser, programId: string, webhookId: string, input: WebhookInput, ipAddress?: string) {
  const existing = await prisma.webhooks.findFirst({ where: { id: webhookId, institution_program_id: programId }, select: { id: true, name: true, status: true } });
  if (!existing) return null;
  const webhook = await prisma.$transaction(async (tx) => {
    await tx.webhook_field_mappings.deleteMany({ where: { webhook_id: webhookId } });
    const updated = await tx.webhooks.update({
      where: { id: webhookId },
      data: { name: input.name, target_module: input.targetModule, status: input.status, updated_at: new Date(), field_mappings: { create: input.mappings.map((mapping) => ({ incoming_key: mapping.incomingKey, crm_field: mapping.crmField, is_required: mapping.isRequired, default_value: mapping.defaultValue || null })) } },
      include: { field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] } },
    });
    await tx.audit_logs.create({ data: { user_id: user.id, entity_type: "webhook", entity_id: webhookId, action: "update", ip_address: ipAddress, old_data: existing, new_data: { name: input.name, status: input.status, mappings: input.mappings } } });
    return updated;
  });
  return { ...serializeWebhook(webhook), mappings: webhook.field_mappings.map(serializeMapping) };
}

export async function deleteWebhook(user: AuthUser, programId: string, webhookId: string, ipAddress?: string) {
  const existing = await prisma.webhooks.findFirst({ where: { id: webhookId, institution_program_id: programId }, select: { id: true, name: true } });
  if (!existing) return false;
  await prisma.$transaction(async (tx) => {
    await tx.audit_logs.create({ data: { user_id: user.id, entity_type: "webhook", entity_id: webhookId, action: "delete", ip_address: ipAddress, old_data: existing } });
    await tx.webhooks.delete({ where: { id: webhookId } });
  });
  return true;
}

export async function regenerateWebhookSecret(user: AuthUser, programId: string, webhookId: string, ipAddress?: string) {
  const existing = await prisma.webhooks.findFirst({ where: { id: webhookId, institution_program_id: programId }, select: { id: true } });
  if (!existing) return null;
  const secret = generateSecret();
  await prisma.$transaction([
    prisma.webhooks.update({ where: { id: webhookId }, data: { secret_hash: await hash(secret, 12), updated_at: new Date() } }),
    prisma.audit_logs.create({ data: { user_id: user.id, entity_type: "webhook", entity_id: webhookId, action: "regenerate_secret", ip_address: ipAddress } }),
  ]);
  return { secret };
}

export async function setWebhookStatus(user: AuthUser, programId: string, webhookId: string, status: "ACTIVE" | "DISABLED", ipAddress?: string) {
  const existing = await prisma.webhooks.findFirst({ where: { id: webhookId, institution_program_id: programId }, select: { id: true, status: true } });
  if (!existing) return null;
  await prisma.$transaction([
    prisma.webhooks.update({ where: { id: webhookId }, data: { status, updated_at: new Date() } }),
    prisma.audit_logs.create({ data: { user_id: user.id, entity_type: "webhook", entity_id: webhookId, action: status === "ACTIVE" ? "enable" : "disable", ip_address: ipAddress, old_data: { status: existing.status }, new_data: { status } } }),
  ]);
  return { id: webhookId, status };
}

export async function listWebhookLogs(programId: string, webhookId: string, query: { page: number; limit: number }) {
  const webhook = await prisma.webhooks.findFirst({ where: { id: webhookId, institution_program_id: programId }, select: { id: true } });
  if (!webhook) return null;
  const where = { webhook_id: webhookId };
  const [items, total] = await prisma.$transaction([
    prisma.webhook_requests.findMany({ where, orderBy: [{ received_at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.webhook_requests.count({ where }),
  ]);
  return {
    data: items.map((item) => ({ id: item.id, requestId: item.request_id, status: item.status, responseCode: item.response_code, errorCode: item.error_code, errorMessage: item.error_message, recordId: item.record_id, processingTimeMs: item.processing_time_ms, receivedAt: item.received_at.toISOString(), processedAt: item.processed_at.toISOString() })),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function getWebhookLog(programId: string, webhookId: string, logId: string) {
  const item = await prisma.webhook_requests.findFirst({ where: { id: logId, webhook_id: webhookId, webhooks: { institution_program_id: programId } } });
  if (!item) return null;
  return { id: item.id, requestId: item.request_id, status: item.status, payload: item.payload, mappedPayload: item.mapped_payload, responseCode: item.response_code, errorCode: item.error_code, errorMessage: item.error_message, recordId: item.record_id, processingTimeMs: item.processing_time_ms, receivedAt: item.received_at.toISOString(), processedAt: item.processed_at.toISOString() };
}

class ProcessFailure extends Error {
  constructor(public readonly code: WebhookErrorCode, message: string, public readonly status: number, public readonly field?: string) {
    super(message);
  }
}

function convertFieldValue(value: unknown, metadata: FieldMetadata) {
  if (metadata.type === "string") {
    if (["string", "number", "boolean"].includes(typeof value)) return String(value).trim();
    throw new ProcessFailure("INVALID_FIELD_VALUE", `Giá trị của '${metadata.label}' không hợp lệ.`, 400, metadata.key);
  }
  if (metadata.type === "number") {
    const converted = typeof value === "number" ? value : Number(String(value).trim());
    if (Number.isFinite(converted)) return converted;
  }
  if (metadata.type === "boolean") {
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  if (metadata.type === "email") {
    const converted = String(value).trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(converted)) return converted;
  }
  if (metadata.type === "phone") {
    const converted = String(value).replace(/[\s().-]/g, "");
    if (/^\d{10}$/.test(converted)) return converted;
  }
  if (metadata.type === "date" || metadata.type === "datetime") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return metadata.type === "date" ? date.toISOString().slice(0, 10) : date.toISOString();
  }
  throw new ProcessFailure("INVALID_FIELD_VALUE", `Giá trị của '${metadata.label}' không hợp lệ.`, 400, metadata.key);
}

async function resolveSource(programId: string, value: unknown) {
  const sourceValue = String(value).trim();
  const isId = /^[0-9a-f-]{36}$/i.test(sourceValue);
  const source = await prisma.lead_sources.findFirst({
    where: {
      institution_program_id: programId,
      OR: isId
        ? [{ id: sourceValue }]
        : [{ name: { equals: sourceValue, mode: "insensitive" } }, { name: { contains: sourceValue, mode: "insensitive" } }],
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!source) throw new ProcessFailure("INVALID_FIELD_VALUE", "Nguồn lead không tồn tại trong chương trình này.", 400, "source");
  return source.id;
}

async function mapPayload(programId: string, payload: JsonObject, mappings: Array<{ incoming_key: string; crm_field: string; is_required: boolean; default_value: string | null }>) {
  const mapped: JsonObject = {};
  for (const mapping of mappings) {
    const metadata = metadataByKey.get(mapping.crm_field);
    if (!metadata) throw new ProcessFailure("INVALID_FIELD_VALUE", "Cấu hình mapping chứa trường CRM không được phép.", 400, mapping.crm_field);
    let value = Object.prototype.hasOwnProperty.call(payload, mapping.incoming_key) ? payload[mapping.incoming_key] : mapping.default_value;
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      if (mapping.is_required) throw new ProcessFailure("MISSING_REQUIRED_FIELD", `Trường bắt buộc '${mapping.incoming_key}' đang thiếu.`, 400, mapping.incoming_key);
      continue;
    }
    mapped[mapping.crm_field] = convertFieldValue(value, metadata);
  }
  for (const metadata of webhookFieldMetadata.filter((field) => field.requiredByCrm)) {
    if (mapped[metadata.key] === undefined) throw new ProcessFailure("MISSING_REQUIRED_FIELD", `Chưa mapping trường CRM bắt buộc '${metadata.label}'.`, 400, metadata.key);
  }
  mapped.sourceId = await resolveSource(programId, mapped.source);
  delete mapped.source;
  return mapped;
}

function resultFailure(code: WebhookErrorCode, message: string, status: number, field?: string): WebhookProcessResult {
  return { ok: false, status, error: { code, message, ...(field ? { field } : {}) } };
}

async function saveFailedLog(webhookId: string, requestId: string, receivedAt: Date, startedAt: number, payload: JsonObject, failure: ProcessFailure, mappedPayload?: JsonObject) {
  const processedAt = new Date();
  await prisma.webhook_requests.update({ where: { request_id: requestId }, data: { status: "FAILED", mapped_payload: mappedPayload ? toJson(mappedPayload) : undefined, response_code: failure.status, error_code: failure.code, error_message: failure.message, processing_time_ms: Math.max(0, Date.now() - startedAt), processed_at: processedAt } });
}

export async function logRejectedInboundWebhook(webhookKey: string, code: WebhookErrorCode, message: string, responseCode: number) {
  const webhook = await prisma.webhooks.findUnique({ where: { webhook_key: webhookKey }, select: { id: true } });
  if (!webhook) return;
  const now = new Date();
  await prisma.$transaction([
    prisma.webhooks.update({ where: { id: webhook.id }, data: { last_received_at: now } }),
    prisma.webhook_requests.create({ data: { webhook_id: webhook.id, request_id: randomUUID(), status: "FAILED", payload: {}, response_code: responseCode, error_code: code, error_message: message, processing_time_ms: 0, received_at: now, processed_at: now } }),
  ]);
}

export async function processInboundWebhook(
  webhookKey: string,
  secret: string | undefined,
  payload: unknown,
  isRateLimited?: (webhookId: string) => boolean,
): Promise<WebhookProcessResult> {
  const webhook = await prisma.webhooks.findUnique({ where: { webhook_key: webhookKey }, include: { field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] } } });
  if (!webhook) return resultFailure("WEBHOOK_NOT_FOUND", "Không tìm thấy webhook.", 404);
  return processWebhookRecord(webhook, payload, secret, false, isRateLimited?.(webhook.id) ?? false);
}

async function processWebhookRecord(webhook: ProcessWebhookRecord, payload: unknown, secret?: string, trustedTest = false, rateLimited = false): Promise<WebhookProcessResult> {
  const requestId = randomUUID();
  const receivedAt = new Date();
  const startedAt = Date.now();
  const safePayload = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as JsonObject : {};
  let mappedPayload: JsonObject | undefined;
  await prisma.webhooks.update({ where: { id: webhook.id }, data: { last_received_at: receivedAt } });
  await prisma.webhook_requests.create({ data: { webhook_id: webhook.id, request_id: requestId, status: "PROCESSING", payload: toJson(safePayload), response_code: 0, processing_time_ms: 0, received_at: receivedAt, processed_at: receivedAt } });
  try {
    if (rateLimited) throw new ProcessFailure("RATE_LIMITED", "Webhook đã vượt quá 300 request/phút.", 429);
    if (webhook.status !== "ACTIVE") throw new ProcessFailure("WEBHOOK_DISABLED", "Webhook đang bị tắt.", 403);
    if (!trustedTest && (!secret || !(await compare(secret, webhook.secret_hash)))) throw new ProcessFailure("INVALID_SECRET", "Webhook secret không hợp lệ.", 401);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ProcessFailure("INVALID_JSON", "Payload phải là một JSON object hợp lệ.", 400);
    const mapped = await mapPayload(webhook.institution_program_id, safePayload, webhook.field_mappings);
    mappedPayload = mapped;
    const actor = await getAuthUser(webhook.created_by);
    if (!actor) throw new ProcessFailure("RECORD_CREATE_FAILED", "Không thể xác định người tạo webhook.", 422);
    const leadInput = {
      ...mapped,
      ...(mapped.graduationYear !== undefined ? { graduationYear: String(mapped.graduationYear) } : {}),
      ...(mapped.monthlyRevenue !== undefined ? { monthlyRevenue: String(mapped.monthlyRevenue) } : {}),
      institutionProgramId: webhook.institution_program_id,
    } as unknown as LeadInput;
    const result = await createLead(actor, leadInput);
    if (!result.ok) {
      const message = result.reason === "phone_already_exists" ? "Số điện thoại đã tồn tại trong danh sách lead." : "Không thể tạo lead từ payload webhook.";
      throw new ProcessFailure("RECORD_CREATE_FAILED", message, result.reason === "phone_already_exists" ? 409 : 422);
    }
    const processedAt = new Date();
    await prisma.webhook_requests.update({ where: { request_id: requestId }, data: { status: "SUCCESS", mapped_payload: toJson(mapped), response_code: 200, record_id: result.data.id, processing_time_ms: Math.max(0, Date.now() - startedAt), processed_at: processedAt } });
    return { ok: true, status: 200, data: { record_id: result.data.id, request_id: requestId } };
  } catch (error) {
    const failure = error instanceof ProcessFailure ? error : new ProcessFailure("RECORD_CREATE_FAILED", "Không thể xử lý webhook.", 500);
    await saveFailedLog(webhook.id, requestId, receivedAt, startedAt, safePayload, failure, mappedPayload);
    return { ok: false, status: failure.status, error: { code: failure.code, message: failure.message, ...(failure.field ? { field: failure.field } : {}) }, requestId };
  }
}

export async function testWebhook(programId: string, webhookId: string, payload: unknown) {
  const webhook = await prisma.webhooks.findFirst({ where: { id: webhookId, institution_program_id: programId }, include: { field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] } } });
  if (!webhook) return resultFailure("WEBHOOK_NOT_FOUND", "Không tìm thấy webhook.", 404);
  return processWebhookRecord(webhook, payload, undefined, true);
}
