import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationOptions,
  getAutomationRule,
  listAutomationRules,
  listExecutionLogs,
  toggleAutomationRule,
  updateAutomationRule,
} from "./automation.service";

export const automationsRouter = Router();

automationsRouter.use(requireAuthentication);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((v) => v || undefined),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  triggerType: z.string().trim().max(100).optional().transform((v) => v || undefined),
  institutionProgramId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(255),
  description: z.string().trim().max(1000).optional().transform((v) => v || undefined),
  triggerType: z.string().trim().min(1).max(100),
  graphData: z.record(z.string(), z.unknown()).default({ nodes: [], edges: [] }),
  institutionProgramId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  triggerType: z.string().trim().min(1).max(100).optional(),
  graphData: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  institutionProgramId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
});

const toggleSchema = z.object({
  isActive: z.boolean(),
});

const logQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const entityIdSchema = z.string().uuid();

// GET /api/automations
automationsRouter.get(
  "/",
  requireAnyPermission("automation.manage"),
  async (request, response, next) => {
    try {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số danh sách automation không hợp lệ." });
        return;
      }
      response.json(await listAutomationRules(parsed.data));
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/automations/options
automationsRouter.get(
  "/options",
  requireAnyPermission("automation.manage"),
  async (_request, response, next) => {
    try {
      response.json(await getAutomationOptions());
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/automations/:id
automationsRouter.get(
  "/:id",
  requireAnyPermission("automation.manage"),
  async (request, response, next) => {
    try {
      const parsedId = entityIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        response.status(400).json({ message: "Mã automation không hợp lệ." });
        return;
      }
      const rule = await getAutomationRule(parsedId.data);
      if (!rule) {
        response.status(404).json({ message: "Không tìm thấy automation rule." });
        return;
      }
      response.json(rule);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/automations
automationsRouter.post(
  "/",
  requireAnyPermission("automation.manage"),
  async (request, response, next) => {
    try {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Thông tin automation rule không hợp lệ." });
        return;
      }
      const rule = await createAutomationRule(request.authUser!, parsed.data);
      response.status(201).json(rule);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/automations/:id
automationsRouter.patch(
  "/:id",
  requireAnyPermission("automation.manage"),
  async (request, response, next) => {
    try {
      const parsedId = entityIdSchema.safeParse(request.params.id);
      const parsedBody = updateSchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Dữ liệu cập nhật automation không hợp lệ." });
        return;
      }
      const updated = await updateAutomationRule(request.authUser!, parsedId.data, parsedBody.data);
      if (!updated) {
        response.status(404).json({ message: "Không tìm thấy automation rule." });
        return;
      }
      response.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/automations/:id/toggle
automationsRouter.patch(
  "/:id/toggle",
  requireAnyPermission("automation.manage"),
  async (request, response, next) => {
    try {
      const parsedId = entityIdSchema.safeParse(request.params.id);
      const parsedBody = toggleSchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Dữ liệu bật/tắt automation không hợp lệ." });
        return;
      }
      const updated = await toggleAutomationRule(request.authUser!, parsedId.data, parsedBody.data.isActive);
      if (!updated) {
        response.status(404).json({ message: "Không tìm thấy automation rule." });
        return;
      }
      response.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/automations/:id
automationsRouter.delete(
  "/:id",
  requireAnyPermission("automation.manage"),
  async (request, response, next) => {
    try {
      const parsedId = entityIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        response.status(400).json({ message: "Mã automation không hợp lệ." });
        return;
      }
      const result = await deleteAutomationRule(request.authUser!, parsedId.data);
      if (!result) {
        response.status(404).json({ message: "Không tìm thấy automation rule." });
        return;
      }
      if (!result.ok) {
        response.status(409).json({ message: "Không thể xoá rule đang được bật. Vui lòng tắt rule trước." });
        return;
      }
      response.json({ message: "Đã xoá automation rule." });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/automations/:id/logs
automationsRouter.get(
  "/:id/logs",
  requireAnyPermission("automation.manage"),
  async (request, response, next) => {
    try {
      const parsedId = entityIdSchema.safeParse(request.params.id);
      const parsedQuery = logQuerySchema.safeParse(request.query);
      if (!parsedId.success || !parsedQuery.success) {
        response.status(400).json({ message: "Tham số không hợp lệ." });
        return;
      }
      response.json(await listExecutionLogs(parsedId.data, parsedQuery.data.page, parsedQuery.data.limit));
    } catch (error) {
      next(error);
    }
  },
);
