import { Router } from "express";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import { getAuditLogDetail, getAuditLogFilterOptions, listAuditLogs } from "./audit-log-list.service";

const dateQuery = z.string().trim().optional().or(z.literal("")).transform((value, context) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    context.addIssue({ code: "custom", message: "Invalid date" });
    return z.NEVER;
  }
  return parsed;
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  action: z.string().trim().max(100).optional().transform((value) => value || undefined),
  entityType: z.string().trim().max(100).optional().transform((value) => value || undefined),
  userId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  fromDate: dateQuery,
  toDate: dateQuery,
  sortBy: z.enum(["createdAt", "action", "entityType"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const auditLogsRouter = Router();

auditLogsRouter.get(
  "/",
  requireAuthentication,
  requireAnyPermission("audit.view"),
  async (request, response, next) => {
    try {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số nhật ký hệ thống không hợp lệ." });
        return;
      }

      response.json(await listAuditLogs(parsed.data));
    } catch (error) {
      next(error);
    }
  },
);

auditLogsRouter.get(
  "/options",
  requireAuthentication,
  requireAnyPermission("audit.view"),
  async (_request, response, next) => {
    try {
      response.json(await getAuditLogFilterOptions());
    } catch (error) {
      next(error);
    }
  },
);

auditLogsRouter.get(
  "/:id",
  requireAuthentication,
  requireAnyPermission("audit.view"),
  async (request, response, next) => {
    try {
      const parsed = z.uuid().safeParse(request.params.id);
      if (!parsed.success) {
        response.status(400).json({ message: "Mã nhật ký không hợp lệ." });
        return;
      }

      const detail = await getAuditLogDetail(parsed.data);
      if (!detail) {
        response.status(404).json({ message: "Không tìm thấy nhật ký hệ thống." });
        return;
      }

      response.json(detail);
    } catch (error) {
      next(error);
    }
  },
);
