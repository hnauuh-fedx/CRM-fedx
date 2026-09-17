import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../../middlewares/auth.middleware";
import {
  disconnectZaloConnection,
  findVisibleZaloConnection,
  getZaloConnectionOptions,
  isZaloWebhookValidationRequest,
  listZaloConnections,
  listZaloProcessingLogs,
  saveManualZaloConnection,
  storeZaloWebhookMessage,
  testZaloConnection,
  verifyZaloWebhookSignature,
  type ZaloWebhookPayload,
} from "./zalo-integration.service";
import { enqueueZaloMessage, enqueueZaloRefresh } from "./zalo-worker.service";

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

const manualConnectionSchema = z.object({
  appId: z.string().trim().min(1).optional(),
  accessToken: z.string().trim().min(20),
  refreshToken: z.string().trim().min(20),
  accessTokenExpiresInHours: z.coerce.number().positive().max(168),
  refreshTokenExpiresInDays: z.coerce.number().positive().max(365).nullable().optional(),
  institutionProgramId: z.uuid(),
  leadSourceId: z.uuid(),
});

const idSchema = z.uuid();

export const zaloRouter = Router();

zaloRouter.post("/webhook", async (request, response, next) => {
  try {
    const payload = request.body as ZaloWebhookPayload;
    if (isZaloWebhookValidationRequest(payload, request.header("user-agent"))) {
      response.status(200).json({ message: "OK" });
      return;
    }
    const signature = request.header("x-zevent-signature");
    if (!verifyZaloWebhookSignature(request.rawBody ?? JSON.stringify(payload), signature, payload)) {
      response.status(401).json({ message: "Chữ ký webhook Zalo không hợp lệ." });
      return;
    }
    const stored = await storeZaloWebhookMessage(payload);
    if (stored) await enqueueZaloMessage(stored.messageId);
    response.status(200).json({ message: "OK" });
  } catch (error) {
    next(error);
  }
});

zaloRouter.get(
  "/",
  requireAuthentication,
  requireAnyPermission("integration.view", "integration.manage"),
  async (request, response, next) => {
    try {
      response.json(await listZaloConnections(request.authUser!));
    } catch (error) {
      next(error);
    }
  },
);

zaloRouter.get(
  "/options",
  requireAuthentication,
  requireAnyPermission("integration.view", "integration.manage"),
  async (request, response, next) => {
    try {
      response.json(await getZaloConnectionOptions(request.authUser!));
    } catch (error) {
      next(error);
    }
  },
);

zaloRouter.get(
  "/logs",
  requireAuthentication,
  requireAnyPermission("integration.log.view", "integration.manage"),
  async (request, response, next) => {
    try {
      const parsed = z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }).safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số phân trang không hợp lệ." });
        return;
      }
      response.json(await listZaloProcessingLogs(request.authUser!, parsed.data.page, parsed.data.limit));
    } catch (error) {
      next(error);
    }
  },
);

zaloRouter.post(
  "/manual",
  requireAuthentication,
  requireAnyPermission("integration.manage"),
  async (request, response) => {
    const parsed = manualConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Thông tin kết nối Zalo OA không hợp lệ.", issues: parsed.error.issues });
      return;
    }
    try {
      response.status(201).json(await saveManualZaloConnection(request.authUser!, parsed.data));
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : "Không thể lưu kết nối Zalo OA." });
    }
  },
);

zaloRouter.post(
  "/:id/test",
  requireAuthentication,
  requireAnyPermission("integration.manage"),
  async (request, response) => {
    const parsed = idSchema.safeParse(request.params.id);
    if (!parsed.success) {
      response.status(400).json({ message: "ID kết nối không hợp lệ." });
      return;
    }
    try {
      const result = await testZaloConnection(request.authUser!, parsed.data);
      if (!result) {
        response.status(404).json({ message: "Không tìm thấy kết nối Zalo OA." });
        return;
      }
      response.json(result);
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : "Không thể kiểm tra kết nối Zalo OA." });
    }
  },
);

zaloRouter.post(
  "/:id/refresh",
  requireAuthentication,
  requireAnyPermission("integration.manage"),
  async (request, response, next) => {
    try {
      const parsed = idSchema.safeParse(request.params.id);
      if (!parsed.success) {
        response.status(400).json({ message: "ID kết nối không hợp lệ." });
        return;
      }
      const connection = await findVisibleZaloConnection(request.authUser!, parsed.data);
      if (!connection) {
        response.status(404).json({ message: "Không tìm thấy kết nối Zalo OA." });
        return;
      }
      const queued = await enqueueZaloRefresh(parsed.data, true);
      response.status(202).json({ queued, message: queued ? "Đã đưa yêu cầu làm mới token vào hàng đợi." : "Worker Zalo đang tắt." });
    } catch (error) {
      next(error);
    }
  },
);

zaloRouter.delete(
  "/:id",
  requireAuthentication,
  requireAnyPermission("integration.manage"),
  async (request, response, next) => {
    try {
      const parsed = idSchema.safeParse(request.params.id);
      if (!parsed.success) {
        response.status(400).json({ message: "ID kết nối không hợp lệ." });
        return;
      }
      const result = await disconnectZaloConnection(request.authUser!, parsed.data);
      if (!result) {
        response.status(404).json({ message: "Không tìm thấy kết nối Zalo OA." });
        return;
      }
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);
