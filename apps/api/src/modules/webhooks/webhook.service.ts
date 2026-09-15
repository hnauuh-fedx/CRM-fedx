import { randomBytes, randomUUID } from "node:crypto";

import { compare, hash } from "bcryptjs";

import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getAuthUser } from "../auth/auth.service";
import { applyInboundLeadMutation } from "../leads/lead-inbound.service";
import type { LeadInput } from "../leads/lead-management.service";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import {
  webhookFieldMetadata,
  type WebhookDuplicatePolicy,
  type WebhookErrorCode,
  type WebhookFieldType,
  type WebhookInput,
  type WebhookProcessResult,
} from "./webhook.types";

type JsonObject = Record<string, unknown>;
type FieldMetadata = {
  key: string;
  label: string;
  type: WebhookFieldType;
  requiredByCrm: boolean;
  group: "STANDARD" | "CUSTOM";
  customFieldId?: string;
  options?: string[];
};
type ProcessWebhookRecord = {
  id: string;
  institution_program_id: string;
  created_by: string;
  secret_hash: string;
  status: string;
  duplicate_policy: string;
  target_module: string;
  field_mappings: Array<{
    incoming_key: string;
    crm_field: string;
    is_required: boolean;
    default_value: string | null;
  }>;
};

const sensitiveKeys =
  /^(authorization|x-webhook-secret|password|pass|password_hash|secret|webhook_secret|token|access_token|refresh_token|api_key)$/i;
const supportedCustomFieldTypes = new Set([
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "SELECT",
  "MULTI_SELECT",
  "DATE",
  "DATETIME",
  "BOOLEAN",
  "EMAIL",
  "PHONE",
]);

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
  duplicate_policy: string;
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
    duplicatePolicy: webhook.duplicate_policy,
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
    Object.entries(value as JsonObject).map(([key, child]) => [
      key,
      sensitiveKeys.test(key) ? "[REDACTED]" : sanitizeJson(child),
    ]),
  );
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

function toWebhookFieldType(fieldType: string): WebhookFieldType {
  if (fieldType === "NUMBER") return "number";
  if (fieldType === "BOOLEAN") return "boolean";
  if (fieldType === "DATE") return "date";
  if (fieldType === "DATETIME") return "datetime";
  if (fieldType === "EMAIL") return "email";
  if (fieldType === "PHONE") return "phone";
  if (fieldType === "SELECT") return "select";
  if (fieldType === "MULTI_SELECT") return "multi_select";
  return "string";
}

async function getAllowedFieldMetadata(
  programId: string,
): Promise<FieldMetadata[]> {
  const customFields = await prisma.custom_fields.findMany({
    where: {
      entity_type: "LEAD",
      is_active: true,
      archived_at: null,
      is_sensitive: false,
      field_type: { in: Array.from(supportedCustomFieldTypes) },
      custom_field_groups: { is: { is_active: true, archived_at: null } },
      OR: [
        { scope_type: "GLOBAL" },
        { scope_type: "PROGRAM", program_id: programId },
      ],
    },
    include: { custom_field_groups: true },
    orderBy: [
      { custom_field_groups: { display_order: "asc" } },
      { display_order: "asc" },
      { id: "asc" },
    ],
  });
  return [
    ...webhookFieldMetadata.map((field) => ({ ...field }) as FieldMetadata),
    ...customFields.map((field) => ({
      key: `custom:${field.id}`,
      label: field.field_label,
      type: toWebhookFieldType(field.field_type),
      requiredByCrm: field.is_required ?? false,
      group: "CUSTOM" as const,
      customFieldId: field.id,
      options: (
        (field.options ?? []) as Array<{ code?: unknown; isActive?: unknown }>
      )
        .filter((option) => option.isActive && typeof option.code === "string")
        .map((option) => option.code as string),
    })),
  ];
}

export async function getWebhookFieldMetadata(programId: string) {
  return {
    targetModules: [{ value: "LEAD", label: "Lead" }],
    fields: await getAllowedFieldMetadata(programId),
  };
}

export async function hasOnlyAllowedWebhookMappings(
  programId: string,
  mappings: WebhookInput["mappings"],
) {
  const allowed = new Set(
    (await getAllowedFieldMetadata(programId)).map((field) => field.key),
  );
  return mappings.every((mapping) => allowed.has(mapping.crmField));
}

export async function listWebhooks(
  programId: string,
  query: { page: number; limit: number },
) {
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
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getWebhook(programId: string, webhookId: string) {
  const webhook = await prisma.webhooks.findFirst({
    where: { id: webhookId, institution_program_id: programId },
    include: {
      field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
    },
  });
  if (!webhook) return null;
  return {
    ...serializeWebhook(webhook),
    mappings: webhook.field_mappings.map(serializeMapping),
  };
}

export async function createWebhook(
  user: AuthUser,
  programId: string,
  input: WebhookInput,
  ipAddress?: string,
) {
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
        duplicate_policy: input.duplicatePolicy,
        created_by: user.id,
        field_mappings: {
          create: input.mappings.map((mapping) => ({
            incoming_key: mapping.incomingKey,
            crm_field: mapping.crmField,
            is_required: mapping.isRequired,
            default_value: mapping.defaultValue || null,
          })),
        },
      },
      include: {
        field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "webhook",
        entity_id: created.id,
        action: "create",
        ip_address: ipAddress,
        new_data: {
          name: input.name,
          targetModule: input.targetModule,
          status: input.status,
          duplicatePolicy: input.duplicatePolicy,
          institutionProgramId: programId,
        },
      },
    });
    return created;
  });
  return {
    ...serializeWebhook(webhook),
    mappings: webhook.field_mappings.map(serializeMapping),
    secret,
  };
}

export async function updateWebhook(
  user: AuthUser,
  programId: string,
  webhookId: string,
  input: WebhookInput,
  ipAddress?: string,
) {
  const existing = await prisma.webhooks.findFirst({
    where: { id: webhookId, institution_program_id: programId },
    select: { id: true, name: true, status: true, duplicate_policy: true },
  });
  if (!existing) return null;
  const webhook = await prisma.$transaction(async (tx) => {
    await tx.webhook_field_mappings.deleteMany({
      where: { webhook_id: webhookId },
    });
    const updated = await tx.webhooks.update({
      where: { id: webhookId },
      data: {
        name: input.name,
        target_module: input.targetModule,
        status: input.status,
        duplicate_policy: input.duplicatePolicy,
        updated_at: new Date(),
        field_mappings: {
          create: input.mappings.map((mapping) => ({
            incoming_key: mapping.incomingKey,
            crm_field: mapping.crmField,
            is_required: mapping.isRequired,
            default_value: mapping.defaultValue || null,
          })),
        },
      },
      include: {
        field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "webhook",
        entity_id: webhookId,
        action: "update",
        ip_address: ipAddress,
        old_data: existing,
        new_data: {
          name: input.name,
          status: input.status,
          duplicatePolicy: input.duplicatePolicy,
          mappings: input.mappings,
        },
      },
    });
    return updated;
  });
  return {
    ...serializeWebhook(webhook),
    mappings: webhook.field_mappings.map(serializeMapping),
  };
}

export async function deleteWebhook(
  user: AuthUser,
  programId: string,
  webhookId: string,
  ipAddress?: string,
) {
  const existing = await prisma.webhooks.findFirst({
    where: { id: webhookId, institution_program_id: programId },
    select: { id: true, name: true },
  });
  if (!existing) return false;
  await prisma.$transaction(async (tx) => {
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "webhook",
        entity_id: webhookId,
        action: "delete",
        ip_address: ipAddress,
        old_data: existing,
      },
    });
    await tx.webhooks.delete({ where: { id: webhookId } });
  });
  return true;
}

export async function regenerateWebhookSecret(
  user: AuthUser,
  programId: string,
  webhookId: string,
  ipAddress?: string,
) {
  const existing = await prisma.webhooks.findFirst({
    where: { id: webhookId, institution_program_id: programId },
    select: { id: true },
  });
  if (!existing) return null;
  const secret = generateSecret();
  await prisma.$transaction([
    prisma.webhooks.update({
      where: { id: webhookId },
      data: { secret_hash: await hash(secret, 12), updated_at: new Date() },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "webhook",
        entity_id: webhookId,
        action: "regenerate_secret",
        ip_address: ipAddress,
      },
    }),
  ]);
  return { secret };
}

export async function setWebhookStatus(
  user: AuthUser,
  programId: string,
  webhookId: string,
  status: "ACTIVE" | "DISABLED",
  ipAddress?: string,
) {
  const existing = await prisma.webhooks.findFirst({
    where: { id: webhookId, institution_program_id: programId },
    select: { id: true, status: true },
  });
  if (!existing) return null;
  await prisma.$transaction([
    prisma.webhooks.update({
      where: { id: webhookId },
      data: { status, updated_at: new Date() },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "webhook",
        entity_id: webhookId,
        action: status === "ACTIVE" ? "enable" : "disable",
        ip_address: ipAddress,
        old_data: { status: existing.status },
        new_data: { status },
      },
    }),
  ]);
  return { id: webhookId, status };
}

export async function listWebhookLogs(
  programId: string,
  webhookId: string,
  query: { page: number; limit: number },
) {
  const webhook = await prisma.webhooks.findFirst({
    where: { id: webhookId, institution_program_id: programId },
    select: { id: true },
  });
  if (!webhook) return null;
  const where = { webhook_id: webhookId };
  const [items, total] = await prisma.$transaction([
    prisma.webhook_requests.findMany({
      where,
      orderBy: [{ received_at: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.webhook_requests.count({ where }),
  ]);
  return {
    data: items.map((item) => ({
      id: item.id,
      requestId: item.request_id,
      status: item.status,
      action: item.action,
      responseCode: item.response_code,
      errorCode: item.error_code,
      errorMessage: item.error_message,
      recordId: item.record_id,
      duplicateRecordId: item.duplicate_record_id,
      processingTimeMs: item.processing_time_ms,
      receivedAt: item.received_at.toISOString(),
      processedAt: item.processed_at.toISOString(),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getWebhookLog(
  programId: string,
  webhookId: string,
  logId: string,
) {
  const item = await prisma.webhook_requests.findFirst({
    where: {
      id: logId,
      webhook_id: webhookId,
      webhooks: { institution_program_id: programId },
    },
  });
  if (!item) return null;
  return {
    id: item.id,
    requestId: item.request_id,
    status: item.status,
    action: item.action,
    payload: item.payload,
    mappedPayload: item.mapped_payload,
    responseCode: item.response_code,
    errorCode: item.error_code,
    errorMessage: item.error_message,
    recordId: item.record_id,
    duplicateRecordId: item.duplicate_record_id,
    processingTimeMs: item.processing_time_ms,
    receivedAt: item.received_at.toISOString(),
    processedAt: item.processed_at.toISOString(),
  };
}

class ProcessFailure extends Error {
  constructor(
    public readonly code: WebhookErrorCode,
    message: string,
    public readonly status: number,
    public readonly field?: string,
  ) {
    super(message);
  }
}

function convertFieldValue(value: unknown, metadata: FieldMetadata) {
  if (metadata.type === "string") {
    if (["string", "number", "boolean"].includes(typeof value))
      return String(value).trim();
    throw new ProcessFailure(
      "INVALID_FIELD_VALUE",
      `Giá trị của '${metadata.label}' không hợp lệ.`,
      400,
      metadata.key,
    );
  }
  if (metadata.type === "number") {
    const converted =
      typeof value === "number" ? value : Number(String(value).trim());
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
  if (metadata.type === "date") {
    const converted = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(converted)) {
      const date = new Date(`${converted}T00:00:00.000Z`);
      if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === converted) return converted;
    }
  }
  if (metadata.type === "datetime") {
    const converted = String(value).trim();
    const date = new Date(converted);
    if (/^\d{4}-\d{2}-\d{2}T/.test(converted) && !Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (metadata.type === "select") {
    const converted = String(value).trim();
    if (metadata.options?.includes(converted)) return converted;
  }
  if (metadata.type === "multi_select") {
    let converted = value;
    if (typeof value === "string") {
      try {
        converted = JSON.parse(value);
      } catch {
        converted = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }
    if (
      Array.isArray(converted) &&
      converted.every(
        (item) => typeof item === "string" && metadata.options?.includes(item),
      ) &&
      new Set(converted).size === converted.length
    )
      return converted;
  }
  throw new ProcessFailure(
    "INVALID_FIELD_VALUE",
    `Giá trị của '${metadata.label}' không hợp lệ.`,
    400,
    metadata.key,
  );
}

async function resolveSource(programId: string, value: unknown) {
  const sourceValue = String(value).trim();
  const isId = /^[0-9a-f-]{36}$/i.test(sourceValue);
  const source = await prisma.lead_sources.findFirst({
    where: {
      institution_program_id: programId,
      OR: isId
        ? [{ id: sourceValue }]
        : [
            { name: { equals: sourceValue, mode: "insensitive" } },
            { name: { contains: sourceValue, mode: "insensitive" } },
          ],
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!source)
    throw new ProcessFailure(
      "INVALID_FIELD_VALUE",
      "Nguồn lead không tồn tại trong chương trình này.",
      400,
      "source",
    );
  return source.id;
}

async function mapPayload(
  programId: string,
  payload: JsonObject,
  mappings: Array<{
    incoming_key: string;
    crm_field: string;
    is_required: boolean;
    default_value: string | null;
  }>,
) {
  const metadata = await getAllowedFieldMetadata(programId);
  const metadataByKey = new Map(metadata.map((field) => [field.key, field]));
  const mapped: JsonObject = {};
  const leadValues: JsonObject = {};
  const customFieldValues: Array<{ fieldId: string; value: unknown }> = [];
  const providedFields = new Set<keyof LeadInput>();
  const missingRequiredIncoming: string[] = [];
  for (const mapping of mappings) {
    const metadata = metadataByKey.get(mapping.crm_field);
    if (!metadata)
      throw new ProcessFailure(
        "INVALID_FIELD_VALUE",
        "Cấu hình mapping chứa trường CRM không được phép.",
        400,
        mapping.crm_field,
      );
    let value = Object.prototype.hasOwnProperty.call(
      payload,
      mapping.incoming_key,
    )
      ? payload[mapping.incoming_key]
      : mapping.default_value;
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim())
    ) {
      if (mapping.is_required)
        missingRequiredIncoming.push(mapping.incoming_key);
      continue;
    }
    const converted = convertFieldValue(value, metadata);
    mapped[mapping.crm_field] = converted;
    if (metadata.customFieldId) {
      customFieldValues.push({
        fieldId: metadata.customFieldId,
        value: converted,
      });
    } else {
      leadValues[mapping.crm_field] = converted;
      providedFields.add(mapping.crm_field as keyof LeadInput);
    }
  }
  if (leadValues.source !== undefined) {
    leadValues.sourceId = await resolveSource(programId, leadValues.source);
    providedFields.add("sourceId");
    delete leadValues.source;
  }
  return {
    mapped,
    leadValues,
    customFieldValues,
    providedFields,
    missingRequiredIncoming,
    missingRequiredCrm: metadata
      .filter((field) => field.requiredByCrm && !Object.prototype.hasOwnProperty.call(mapped, field.key))
      .map((field) => field.label),
  };
}

function resultFailure(
  code: WebhookErrorCode,
  message: string,
  status: number,
  field?: string,
): WebhookProcessResult {
  return {
    ok: false,
    status,
    error: { code, message, ...(field ? { field } : {}) },
  };
}

function writeWebhookStructuredLog(input: {
  requestId: string;
  webhookId: string;
  institutionProgramId: string;
  targetModule: string;
  action: "CREATED" | "UPDATED" | "REJECTED" | "FAILED";
  status: "SUCCESS" | "FAILED";
  processingTimeMs: number;
  responseStatus: number;
  errorCode?: WebhookErrorCode;
}) {
  console.info(
    JSON.stringify({ event: "inbound_webhook_processed", ...input }),
  );
}

async function saveFailedLog(
  webhook: ProcessWebhookRecord,
  requestId: string,
  startedAt: number,
  failure: ProcessFailure,
  mappedPayload?: JsonObject,
  duplicateRecordId?: string,
) {
  const processedAt = new Date();
  const processingTimeMs = Math.max(0, Date.now() - startedAt);
  const action = failure.code === "DUPLICATE_RECORD" ? "REJECTED" : "FAILED";
  await prisma.webhook_requests.update({
    where: { request_id: requestId },
    data: {
      status: "FAILED",
      action,
      mapped_payload: mappedPayload ? toJson(mappedPayload) : undefined,
      response_code: failure.status,
      error_code: failure.code,
      error_message: failure.message,
      duplicate_record_id: duplicateRecordId,
      processing_time_ms: processingTimeMs,
      processed_at: processedAt,
    },
  });
  writeWebhookStructuredLog({
    requestId,
    webhookId: webhook.id,
    institutionProgramId: webhook.institution_program_id,
    targetModule: webhook.target_module,
    action,
    status: "FAILED",
    processingTimeMs,
    responseStatus: failure.status,
    errorCode: failure.code,
  });
}

export async function logRejectedInboundWebhook(
  webhookKey: string,
  code: WebhookErrorCode,
  message: string,
  responseCode: number,
) {
  const webhook = await prisma.webhooks.findUnique({
    where: { webhook_key: webhookKey },
    select: { id: true, institution_program_id: true, target_module: true },
  });
  if (!webhook) return;
  const now = new Date();
  const requestId = randomUUID();
  await prisma.$transaction([
    prisma.webhooks.update({
      where: { id: webhook.id },
      data: { last_received_at: now },
    }),
    prisma.webhook_requests.create({
      data: {
        webhook_id: webhook.id,
        request_id: requestId,
        status: "FAILED",
        action: "FAILED",
        payload: {},
        response_code: responseCode,
        error_code: code,
        error_message: message,
        processing_time_ms: 0,
        received_at: now,
        processed_at: now,
      },
    }),
  ]);
  writeWebhookStructuredLog({
    requestId,
    webhookId: webhook.id,
    institutionProgramId: webhook.institution_program_id,
    targetModule: webhook.target_module,
    action: "FAILED",
    status: "FAILED",
    processingTimeMs: 0,
    responseStatus: responseCode,
    errorCode: code,
  });
}

export async function processInboundWebhook(
  webhookKey: string,
  secret: string | undefined,
  payload: unknown,
  isRateLimited?: (webhookId: string) => boolean,
  ipAddress?: string,
): Promise<WebhookProcessResult> {
  const webhook = await prisma.webhooks.findUnique({
    where: { webhook_key: webhookKey },
    include: {
      field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
    },
  });
  if (!webhook)
    return resultFailure("WEBHOOK_NOT_FOUND", "Không tìm thấy webhook.", 404);
  return processWebhookRecord(
    webhook,
    payload,
    secret,
    false,
    isRateLimited?.(webhook.id) ?? false,
    undefined,
    ipAddress,
  );
}

async function processWebhookRecord(
  webhook: ProcessWebhookRecord,
  payload: unknown,
  secret?: string,
  trustedTest = false,
  rateLimited = false,
  actorOverride?: AuthUser,
  ipAddress?: string,
): Promise<WebhookProcessResult> {
  const requestId = randomUUID();
  const receivedAt = new Date();
  const startedAt = Date.now();
  const safePayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as JsonObject)
      : {};
  let mappedPayload: JsonObject | undefined;
  await prisma.webhooks.update({
    where: { id: webhook.id },
    data: { last_received_at: receivedAt },
  });
  await prisma.webhook_requests.create({
    data: {
      webhook_id: webhook.id,
      request_id: requestId,
      status: "PROCESSING",
      action: "FAILED",
      payload: toJson(safePayload),
      response_code: 0,
      processing_time_ms: 0,
      received_at: receivedAt,
      processed_at: receivedAt,
    },
  });
  try {
    if (rateLimited)
      throw new ProcessFailure(
        "RATE_LIMITED",
        "Webhook đã vượt quá 300 request/phút.",
        429,
      );
    if (webhook.status !== "ACTIVE")
      throw new ProcessFailure("WEBHOOK_DISABLED", "Webhook đang bị tắt.", 403);
    if (
      !trustedTest &&
      (!secret || !(await compare(secret, webhook.secret_hash)))
    )
      throw new ProcessFailure(
        "INVALID_SECRET",
        "Webhook secret không hợp lệ.",
        401,
      );
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new ProcessFailure(
        "INVALID_JSON",
        "Payload phải là một JSON object hợp lệ.",
        400,
      );
    const mapping = await mapPayload(
      webhook.institution_program_id,
      safePayload,
      webhook.field_mappings,
    );
    mappedPayload = mapping.mapped;
    const actor = actorOverride ?? (await getAuthUser(webhook.created_by));
    if (!actor)
      throw new ProcessFailure(
        "RECORD_CREATE_FAILED",
        "Không thể xác định người tạo webhook.",
        422,
      );
    if (mapping.leadValues.phone === undefined) {
      throw new ProcessFailure(
        "MISSING_REQUIRED_FIELD",
        "Chưa có số điện thoại để nhận diện Lead trùng.",
        400,
        "phone",
      );
    }
    const missingCreateFields = [...mapping.missingRequiredIncoming, ...mapping.missingRequiredCrm];
    const normalizedLeadValues = {
      ...mapping.leadValues,
      ...(mapping.leadValues.graduationYear !== undefined
        ? { graduationYear: String(mapping.leadValues.graduationYear) }
        : {}),
      ...(mapping.leadValues.monthlyRevenue !== undefined
        ? { monthlyRevenue: String(mapping.leadValues.monthlyRevenue) }
        : {}),
    };
    const leadInput = {
      ...normalizedLeadValues,
      fullName: String(mapping.leadValues.fullName ?? ""),
      phone: String(mapping.leadValues.phone),
      sourceId: String(mapping.leadValues.sourceId ?? ""),
      institutionProgramId: webhook.institution_program_id,
    } as unknown as LeadInput;
    const result = await applyInboundLeadMutation({
      actor,
      institutionProgramId: webhook.institution_program_id,
      duplicatePolicy: webhook.duplicate_policy as WebhookDuplicatePolicy,
      leadInput,
      providedFields: mapping.providedFields,
      customFieldValues: mapping.customFieldValues,
      canCreate: missingCreateFields.length === 0,
      ipAddress,
      enforceActorScope: trustedTest,
    });
    if (!result.ok) {
      if (result.reason === "duplicate") {
        const failure = new ProcessFailure(
          "DUPLICATE_RECORD",
          "Đã tồn tại Lead trùng trong chương trình này.",
          409,
        );
        await saveFailedLog(
          webhook,
          requestId,
          startedAt,
          failure,
          mappedPayload,
          result.duplicateRecordId,
        );
        return {
          ok: false,
          status: 409,
          error: {
            code: failure.code,
            message: failure.message,
            duplicate_record_id: result.duplicateRecordId,
          },
          requestId,
        };
      }
      if (result.reason === "missing_create_fields") {
        throw new ProcessFailure(
          "MISSING_REQUIRED_FIELD",
          `Thiếu trường bắt buộc để tạo Lead: ${missingCreateFields.join(", ")}.`,
          400,
        );
      }
      if (result.reason === "custom_field_invalid") {
        throw new ProcessFailure(
          "INVALID_FIELD_VALUE",
          "Giá trị trường tùy chỉnh không hợp lệ.",
          400,
        );
      }
      if (result.reason === "duplicate_forbidden") {
        throw new ProcessFailure(
          "RECORD_CREATE_FAILED",
          "Bạn không có quyền cập nhật Lead trùng khớp.",
          403,
        );
      }
      throw new ProcessFailure(
        "RECORD_CREATE_FAILED",
        "Không thể tạo Lead từ payload webhook.",
        422,
      );
    }
    const processedAt = new Date();
    const processingTimeMs = Math.max(0, Date.now() - startedAt);
    try {
      await prisma.webhook_requests.update({
        where: { request_id: requestId },
        data: {
          status: "SUCCESS",
          action: result.action,
          mapped_payload: toJson(mapping.mapped),
          response_code: 200,
          record_id: result.recordId,
          duplicate_record_id: result.action === "UPDATED" ? result.recordId : null,
          processing_time_ms: processingTimeMs,
          processed_at: processedAt,
        },
      });
    } catch (error) {
      console.error(JSON.stringify({
        event: "inbound_webhook_result_log_failed",
        requestId,
        webhookId: webhook.id,
        institutionProgramId: webhook.institution_program_id,
        targetModule: webhook.target_module,
        action: result.action,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }));
    }
    writeWebhookStructuredLog({
      requestId,
      webhookId: webhook.id,
      institutionProgramId: webhook.institution_program_id,
      targetModule: webhook.target_module,
      action: result.action,
      status: "SUCCESS",
      processingTimeMs,
      responseStatus: 200,
    });
    return {
      ok: true,
      status: 200,
      data: {
        record_id: result.recordId,
        request_id: requestId,
        action: result.action === "CREATED" ? "created" : "updated",
      },
    };
  } catch (error) {
    if (!(error instanceof ProcessFailure)) {
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined;
      console.error(
        JSON.stringify({
          event: "inbound_webhook_unexpected_error",
          requestId,
          webhookId: webhook.id,
          institutionProgramId: webhook.institution_program_id,
          targetModule: webhook.target_module,
          errorType: error instanceof Error ? error.name : "UnknownError",
          ...(errorCode ? { errorCode } : {}),
        }),
      );
    }
    const failure =
      error instanceof ProcessFailure
        ? error
        : new ProcessFailure(
            "RECORD_CREATE_FAILED",
            "Không thể xử lý webhook.",
            500,
          );
    await saveFailedLog(webhook, requestId, startedAt, failure, mappedPayload);
    return {
      ok: false,
      status: failure.status,
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.field ? { field: failure.field } : {}),
      },
      requestId,
    };
  }
}

export async function testWebhook(
  user: AuthUser,
  programId: string,
  webhookId: string,
  payload: unknown,
  ipAddress?: string,
) {
  const webhook = await prisma.webhooks.findFirst({
    where: { id: webhookId, institution_program_id: programId },
    include: {
      field_mappings: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
    },
  });
  if (!webhook)
    return resultFailure("WEBHOOK_NOT_FOUND", "Không tìm thấy webhook.", 404);
  const result = await processWebhookRecord(
    webhook,
    payload,
    undefined,
    true,
    false,
    user,
    ipAddress,
  );
  const recordId = result.ok ? result.data.record_id : result.error.duplicate_record_id;
  if (recordId) {
    const visibleDuplicate = await prisma.leads.findFirst({
      where: {
        id: recordId,
        institution_program_id: programId,
        deleted_at: null,
        ...getLeadScopeWhere(user),
      },
      select: { id: true },
    });
    if (!visibleDuplicate) {
      if (result.ok) {
        const { record_id: _hidden, ...safeData } = result.data;
        return { ...result, data: safeData };
      }
      const { duplicate_record_id: _hidden, ...safeError } = result.error;
      return { ...result, error: safeError };
    }
  }
  return result;
}
