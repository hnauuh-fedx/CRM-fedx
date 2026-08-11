import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createReportConfig,
  createSlaRule,
  deleteReportConfig,
  deleteSlaRule,
  deleteSystemSetting,
  getSystemManagementDashboard,
  updateReportConfig,
  updateSlaRule,
  upsertSystemSetting,
} from "./system-management.service";

const idSchema = z.uuid();
const settingSchema = z.object({
  key: z.string().trim().min(2).max(150),
  value: z.string().trim().max(5000).optional().or(z.literal("")).transform((value) => value || undefined),
  type: z.enum(["string", "number", "boolean", "json", "secret"]).optional().or(z.literal("")).transform((value) => value || undefined),
});
const slaSchema = z.object({
  name: z.string().trim().min(2).max(255),
  module: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  durationMinutes: z.coerce.number().int().min(1).max(525600),
  action: z.string().trim().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  isActive: z.boolean().default(true),
});
const reportConfigSchema = z.object({
  name: z.string().trim().min(2).max(255),
  reportType: z.string().trim().min(2).max(100),
  filters: z.unknown().optional(),
  isActive: z.boolean().default(true),
});

export const systemRouter = Router();

systemRouter.use(requireAuthentication, requireAnyPermission("system.manage"));

function resultMessage(reason: string) {
  if (reason === "sla_not_found") return "Không tìm thấy cấu hình SLA.";
  if (reason === "report_config_not_found") return "Không tìm thấy cấu hình export/báo cáo.";
  return "Không tìm thấy cấu hình hệ thống.";
}

systemRouter.get("/", async (_request, response, next) => {
  try {
    response.json(await getSystemManagementDashboard());
  } catch (error) {
    next(error);
  }
});

systemRouter.post("/settings", async (request, response, next) => {
  try {
    const parsed = settingSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu cấu hình không hợp lệ." });
      return;
    }
    const result = await upsertSystemSetting(request.authUser!, parsed.data, request.ip);
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.delete("/settings/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã cấu hình không hợp lệ." });
      return;
    }
    const result = await deleteSystemSetting(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.post("/sla-rules", async (request, response, next) => {
  try {
    const parsed = slaSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu SLA không hợp lệ." });
      return;
    }
    const result = await createSlaRule(request.authUser!, parsed.data, request.ip);
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.patch("/sla-rules/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = slaSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật SLA không hợp lệ." });
      return;
    }
    const result = await updateSlaRule(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.delete("/sla-rules/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã SLA không hợp lệ." });
      return;
    }
    const result = await deleteSlaRule(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.post("/export-settings", async (request, response, next) => {
  try {
    const parsed = reportConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu cấu hình export không hợp lệ." });
      return;
    }
    const result = await createReportConfig(request.authUser!, parsed.data, request.ip);
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.patch("/export-settings/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = reportConfigSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật export không hợp lệ." });
      return;
    }
    const result = await updateReportConfig(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.delete("/export-settings/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã cấu hình export không hợp lệ." });
      return;
    }
    const result = await deleteReportConfig(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
