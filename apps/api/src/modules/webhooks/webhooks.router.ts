import express, { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import {
  getInstitutionProgramScope,
  InstitutionProgramScopeError,
} from "../institutions/institution-program-scope";
import {
  webhookDuplicatePolicies,
  webhookStatuses,
  webhookTargetModules,
} from "./webhook.types";
import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  getWebhookFieldMetadata,
  hasOnlyAllowedWebhookMappings,
  getWebhookLog,
  listWebhookLogs,
  listWebhooks,
  logRejectedInboundWebhook,
  regenerateWebhookSecret,
  setWebhookStatus,
  testWebhook,
  updateWebhook,
} from "./webhook.service";
import { ingestInboundWebhook } from "./webhook-v2.service";
import { createRedisWebhookRateLimiter } from "./webhook-rate-limit.service";
import { getWebhookOperationalStatus, reprocessWebhookRequest } from "./webhook-operations.service";

const idSchema = z.uuid();
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const logListQuerySchema = listQuerySchema.extend({
  status: z.enum(["RECEIVED", "QUEUED", "PROCESSING", "RETRYING", "SUCCEEDED", "FAILED", "DEAD_LETTER", "QUEUE_FAILED"]).optional(),
  requestId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
const mappingSchema = z.object({
  incomingKey: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .regex(/^[A-Za-z0-9_.-]+$/),
  crmField: z.string().trim().min(1).max(100),
  isRequired: z.boolean().default(false),
  defaultValue: z
    .string()
    .max(2000)
    .nullish()
    .transform((value) => value?.trim() || null),
});
const webhookBodySchema = z
  .object({
    name: z.string().trim().min(2).max(255),
    targetModule: z.enum(webhookTargetModules).default("LEAD"),
    status: z.enum(webhookStatuses).default("ACTIVE"),
    duplicatePolicy: z.enum(webhookDuplicatePolicies).default("CREATE_NEW"),
    mappings: z.array(mappingSchema).min(1).max(30),
  })
  .superRefine((input, context) => {
    const incomingKeys = new Set<string>();
    const crmFields = new Set<string>();
    input.mappings.forEach((mapping, index) => {
      if (incomingKeys.has(mapping.incomingKey))
        context.addIssue({
          code: "custom",
          path: ["mappings", index, "incomingKey"],
          message: "Incoming key bị trùng.",
        });
      if (crmFields.has(mapping.crmField))
        context.addIssue({
          code: "custom",
          path: ["mappings", index, "crmField"],
          message: "Trường CRM bị trùng.",
        });
      incomingKeys.add(mapping.incomingKey);
      crmFields.add(mapping.crmField);
    });
  });
const testBodySchema = z.object({ payload: z.record(z.string(), z.unknown()) });

function requireProgramId(request: express.Request) {
  const programId = getInstitutionProgramScope(request);
  if (!programId)
    throw new InstitutionProgramScopeError(
      403,
      "Tài khoản chưa được gán chương trình tuyển sinh.",
    );
  return programId;
}

export const webhooksAdminRouter = Router();
webhooksAdminRouter.use(requireAuthentication);

webhooksAdminRouter.get(
  "/metadata",
  requireAnyPermission("webhook.view", "webhook.manage"),
  async (request, response, next) => {
    try {
      response.json(await getWebhookFieldMetadata(requireProgramId(request)));
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.get(
  "/",
  requireAnyPermission("webhook.view", "webhook.manage"),
  async (request, response, next) => {
    try {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return void response
          .status(400)
          .json({ message: "Tham số danh sách webhook không hợp lệ." });
      response.json(await listWebhooks(requireProgramId(request), parsed.data));
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.post(
  "/",
  requireAnyPermission("webhook.manage"),
  async (request, response, next) => {
    try {
      const parsed = webhookBodySchema.safeParse(request.body);
      if (!parsed.success)
        return void response
          .status(400)
          .json({
            message: "Dữ liệu tạo webhook không hợp lệ.",
            issues: parsed.error.issues,
          });
      const programId = requireProgramId(request);
      if (
        !(await hasOnlyAllowedWebhookMappings(programId, parsed.data.mappings))
      )
        return void response
          .status(400)
          .json({
            message:
              "Mapping chứa trường CRM không được phép hoặc không thuộc chương trình này.",
          });
      response
        .status(201)
        .json(
          await createWebhook(
            request.authUser!,
            programId,
            parsed.data,
            request.ip,
          ),
        );
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.get(
  "/operations",
  requireAnyPermission("webhook.view", "webhook.manage"),
  async (request, response, next) => {
    try {
      response.json(await getWebhookOperationalStatus(requireProgramId(request)));
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.post(
  "/:id/logs/:logId/reprocess",
  requireAnyPermission("webhook.manage"),
  async (request, response, next) => {
    try {
      const ids = z.object({ id: idSchema, logId: idSchema }).safeParse(request.params);
      if (!ids.success) return void response.status(400).json({ message: "Mã yêu cầu không hợp lệ." });
      const result = await reprocessWebhookRequest(request.authUser!, requireProgramId(request), ids.data.id, ids.data.logId, request.ip);
      if (!result.ok) {
        if (result.reason === "not_found") return void response.status(404).json({ message: "Không tìm thấy yêu cầu webhook." });
        if (result.reason === "invalid_status") return void response.status(409).json({ message: "Chỉ có thể xử lý lại yêu cầu thất bại hoặc Dead Letter." });
        return void response.status(503).json({ message: "Yêu cầu đã được lưu nhưng hàng đợi đang không khả dụng." });
      }
      response.status(202).json({ requestId: result.requestId, status: result.status });
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.get(
  "/:id/logs/:logId",
  requireAnyPermission("webhook.view", "webhook.manage"),
  async (request, response, next) => {
    try {
      const ids = z
        .object({ id: idSchema, logId: idSchema })
        .safeParse(request.params);
      if (!ids.success)
        return void response
          .status(400)
          .json({ message: "Mã nhật ký không hợp lệ." });
      const log = await getWebhookLog(
        requireProgramId(request),
        ids.data.id,
        ids.data.logId,
      );
      if (!log)
        return void response
          .status(404)
          .json({ message: "Không tìm thấy nhật ký webhook." });
      response.json(log);
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.get(
  "/:id/logs",
  requireAnyPermission("webhook.view", "webhook.manage"),
  async (request, response, next) => {
    try {
      const id = idSchema.safeParse(request.params.id);
      const query = logListQuerySchema.safeParse(request.query);
      if (!id.success || !query.success)
        return void response
          .status(400)
          .json({ message: "Tham số nhật ký webhook không hợp lệ." });
      const result = await listWebhookLogs(
        requireProgramId(request),
        id.data,
        query.data,
      );
      if (!result)
        return void response
          .status(404)
          .json({ message: "Không tìm thấy webhook." });
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.post(
  "/:id/regenerate-secret",
  requireAnyPermission("webhook.manage"),
  async (request, response, next) => {
    try {
      const id = idSchema.safeParse(request.params.id);
      if (!id.success)
        return void response
          .status(400)
          .json({ message: "Mã webhook không hợp lệ." });
      const result = await regenerateWebhookSecret(
        request.authUser!,
        requireProgramId(request),
        id.data,
        request.ip,
      );
      if (!result)
        return void response
          .status(404)
          .json({ message: "Không tìm thấy webhook." });
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.patch(
  "/:id/status",
  requireAnyPermission("webhook.manage"),
  async (request, response, next) => {
    try {
      const id = idSchema.safeParse(request.params.id);
      const body = z
        .object({ status: z.enum(webhookStatuses) })
        .safeParse(request.body);
      if (!id.success || !body.success)
        return void response
          .status(400)
          .json({ message: "Trạng thái webhook không hợp lệ." });
      const result = await setWebhookStatus(
        request.authUser!,
        requireProgramId(request),
        id.data,
        body.data.status,
        request.ip,
      );
      if (!result)
        return void response
          .status(404)
          .json({ message: "Không tìm thấy webhook." });
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.post(
  "/:id/test",
  requireAnyPermission("webhook.manage"),
  async (request, response, next) => {
    try {
      const id = idSchema.safeParse(request.params.id);
      const body = testBodySchema.safeParse(request.body);
      if (!id.success || !body.success)
        return void response
          .status(400)
          .json({ message: "Payload test không hợp lệ." });
      const result = await testWebhook(
        request.authUser!,
        requireProgramId(request),
        id.data,
        body.data.payload,
        request.ip,
      );
      response
        .status(result.status)
        .json(
          result.ok
            ? { success: true, data: result.data }
            : {
                success: false,
                error: result.error,
                message: result.error.message,
              },
        );
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.get(
  "/:id",
  requireAnyPermission("webhook.view", "webhook.manage"),
  async (request, response, next) => {
    try {
      const id = idSchema.safeParse(request.params.id);
      if (!id.success)
        return void response
          .status(400)
          .json({ message: "Mã webhook không hợp lệ." });
      const webhook = await getWebhook(requireProgramId(request), id.data);
      if (!webhook)
        return void response
          .status(404)
          .json({ message: "Không tìm thấy webhook." });
      response.json(webhook);
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.patch(
  "/:id",
  requireAnyPermission("webhook.manage"),
  async (request, response, next) => {
    try {
      const id = idSchema.safeParse(request.params.id);
      const body = webhookBodySchema.safeParse(request.body);
      if (!id.success || !body.success)
        return void response
          .status(400)
          .json({
            message: "Dữ liệu cập nhật webhook không hợp lệ.",
            ...(!body.success ? { issues: body.error.issues } : {}),
          });
      const programId = requireProgramId(request);
      if (!(await hasOnlyAllowedWebhookMappings(programId, body.data.mappings)))
        return void response
          .status(400)
          .json({
            message:
              "Mapping chứa trường CRM không được phép hoặc không thuộc chương trình này.",
          });
      const webhook = await updateWebhook(
        request.authUser!,
        programId,
        id.data,
        body.data,
        request.ip,
      );
      if (!webhook)
        return void response
          .status(404)
          .json({ message: "Không tìm thấy webhook." });
      response.json(webhook);
    } catch (error) {
      next(error);
    }
  },
);

webhooksAdminRouter.delete(
  "/:id",
  requireAnyPermission("webhook.manage"),
  async (request, response, next) => {
    try {
      const id = idSchema.safeParse(request.params.id);
      if (!id.success)
        return void response
          .status(400)
          .json({ message: "Mã webhook không hợp lệ." });
      const deleted = await deleteWebhook(
        request.authUser!,
        requireProgramId(request),
        id.data,
        request.ip,
      );
      if (!deleted)
        return void response
          .status(404)
          .json({ message: "Không tìm thấy webhook." });
      response.json({ id: id.data });
    } catch (error) {
      next(error);
    }
  },
);

export function createWebhookRateLimiter(limit = 300, windowMs = 60_000) {
  const rateWindows = new Map<string, { startedAt: number; count: number }>();
  return (key: string, now = Date.now()) => {
    const current = rateWindows.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      rateWindows.set(key, { startedAt: now, count: 1 });
      return false;
    }
    current.count += 1;
    return current.count > limit;
  };
}

let distributedRateLimiter = createRedisWebhookRateLimiter();

export function setPublicWebhookRateLimiterForTests(limiter: typeof distributedRateLimiter) {
  distributedRateLimiter = limiter;
}

export const publicWebhookRouter = Router();
publicWebhookRouter.use(
  express.raw({ type: "application/json", limit: "256kb" }),
);
publicWebhookRouter.post("/:webhookKey", async (request, response, next) => {
  try {
    const key = z
      .string()
      .min(20)
      .max(100)
      .safeParse(request.params.webhookKey);
    if (!key.success)
      return void response
        .status(404)
        .json({
          success: false,
          error: {
            code: "WEBHOOK_NOT_FOUND",
            message: "Không tìm thấy webhook.",
          },
        });
    if (!request.is("application/json")) {
      await logRejectedInboundWebhook(
        key.data,
        "INVALID_JSON",
        "Webhook chỉ nhận Content-Type application/json.",
        415,
      );
      return void response
        .status(415)
        .json({
          success: false,
          error: {
            code: "INVALID_JSON",
            message: "Webhook chỉ nhận Content-Type application/json.",
          },
        });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(
        Buffer.isBuffer(request.body) ? request.body.toString("utf8") : "",
      );
    } catch {
      payload = null;
    }
    const idempotencyKey = z.string().trim().min(1).max(255).safeParse(request.header("idempotency-key"));
    if (request.header("idempotency-key") && !idempotencyKey.success) {
      return void response.status(400).json({ success: false, error: { code: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency-Key không hợp lệ." } });
    }
    const result = await ingestInboundWebhook(
      key.data,
      request.header("x-webhook-secret"),
      payload,
      idempotencyKey.success ? idempotencyKey.data : undefined,
      distributedRateLimiter,
      request.ip,
    );
    if (!result.ok && result.retryAfterSeconds) response.setHeader("Retry-After", String(result.retryAfterSeconds));
    if (result.ok) {
      response.status(result.status).json({ success: true, data: result.data });
    } else {
      response
        .status(result.status)
        .json({ success: false, error: result.error });
    }
  } catch (error) {
    next(error);
  }
});

const payloadErrorHandler: ErrorRequestHandler = async (
  error,
  request,
  response,
  next,
) => {
  if ((error as { type?: string }).type === "entity.too.large") {
    const webhookKey = request.path.split("/").filter(Boolean)[0];
    if (webhookKey)
      await logRejectedInboundWebhook(
        webhookKey,
        "PAYLOAD_TOO_LARGE",
        "Payload không được vượt quá 256 KB.",
        413,
      );
    response
      .status(413)
      .json({
        success: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Payload không được vượt quá 256 KB.",
        },
      });
    return;
  }
  next(error);
};
publicWebhookRouter.use(payloadErrorHandler);
