import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import { leadListPermissions } from "../leads/lead-list.service";
import {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationOptions,
  getAutomationExecution,
  getAutomationRule,
  listAutomationRules,
  listExecutionLogs,
  listAutomationTestLeads,
  runAutomationTest,
  toggleAutomationRule,
  updateAutomationRule,
  validateAutomationRule,
} from "./automation.service";
import { SUPPORTED_AUTOMATION_TRIGGER_TYPES } from "./automation.types";

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
  triggerType: z.enum(SUPPORTED_AUTOMATION_TRIGGER_TYPES),
  graphData: z.record(z.string(), z.unknown()).default({ nodes: [], edges: [] }),
  institutionProgramId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  triggerType: z.enum(SUPPORTED_AUTOMATION_TRIGGER_TYPES).optional(),
  graphData: z.record(z.string(), z.unknown()).optional(),
  institutionProgramId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
});

const toggleSchema = z.object({
  isActive: z.boolean(),
});

const logQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const testLeadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
});

const testRunSchema = z.object({
  leadId: z.string().uuid(),
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
  async (request, response, next) => {
    try {
      response.json(await getAutomationOptions(request.authUser!));
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/automations/:id/validate
automationsRouter.post(
  "/:id/validate",
  requireAnyPermission("automation.manage"),
  async (request, response, next) => {
    try {
      const parsedId = entityIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        response.status(400).json({ message: "Mã automation không hợp lệ." });
        return;
      }
      const validation = await validateAutomationRule(parsedId.data);
      if (!validation) {
        response.status(404).json({ message: "Không tìm thấy automation rule." });
        return;
      }
      response.status(validation.valid ? 200 : 422).json(validation);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/automations/:id/test-leads
automationsRouter.get(
  "/:id/test-leads",
  requireAnyPermission("automation.manage"),
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      const parsedId = entityIdSchema.safeParse(request.params.id);
      const parsedQuery = testLeadQuerySchema.safeParse(request.query);
      if (!parsedId.success || !parsedQuery.success) {
        response.status(400).json({ message: "Tham số tìm Lead chạy thử không hợp lệ." });
        return;
      }
      const result = await listAutomationTestLeads(request.authUser!, parsedId.data, parsedQuery.data);
      if (!result) {
        response.status(404).json({ message: "Không tìm thấy automation rule." });
        return;
      }
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/automations/:id/test-run
automationsRouter.post(
  "/:id/test-run",
  requireAnyPermission("automation.manage"),
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      const parsedId = entityIdSchema.safeParse(request.params.id);
      const parsedBody = testRunSchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Dữ liệu chạy thử automation không hợp lệ." });
        return;
      }
      const result = await runAutomationTest(request.authUser!, parsedId.data, parsedBody.data.leadId);
      if (!result.ok) {
        if (result.reason === "rule_not_found" || result.reason === "lead_not_found") {
          response.status(404).json({
            message: result.reason === "rule_not_found"
              ? "Không tìm thấy automation rule."
              : "Không tìm thấy Lead trong phạm vi truy cập hoặc phạm vi chương trình của rule.",
          });
          return;
        }
        if (result.reason === "queue_unavailable") {
          response.status(503).json({ message: "Automation worker hiện không khả dụng." });
          return;
        }
        response.status(422).json({
          message: "Rule chưa hợp lệ để chạy thử.",
          validation: "validation" in result ? result.validation : undefined,
        });
        return;
      }
      response.status(202).json(result.data);
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
      if (!updated.ok) {
        response.status(409).json({ message: "Hãy tắt rule trước khi thay đổi cấu hình thực thi." });
        return;
      }
      response.json(updated.data);
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
      if (!updated.ok) {
        response.status(422).json({
          message: updated.reason === "unsupported_trigger"
            ? "Sự kiện kích hoạt này chưa được hệ thống hỗ trợ thực thi."
            : "Rule chưa hợp lệ. Vui lòng sửa các node và kết nối trước khi bật.",
          validation: updated.validation,
        });
        return;
      }
      response.json(updated.data);
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

// GET /api/automations/:id/logs/:executionId
automationsRouter.get(
  "/:id/logs/:executionId",
  requireAnyPermission("automation.manage"),
  async (request, response, next) => {
    try {
      const parsedRuleId = entityIdSchema.safeParse(request.params.id);
      const parsedExecutionId = entityIdSchema.safeParse(request.params.executionId);
      if (!parsedRuleId.success || !parsedExecutionId.success) {
        response.status(400).json({ message: "Mã execution không hợp lệ." });
        return;
      }
      const execution = await getAutomationExecution(parsedRuleId.data, parsedExecutionId.data);
      if (!execution) {
        response.status(404).json({ message: "Không tìm thấy lần thực thi automation." });
        return;
      }
      response.json(execution);
    } catch (error) {
      next(error);
    }
  },
);
