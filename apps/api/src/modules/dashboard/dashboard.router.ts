import { Router } from "express";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import {
  getDirectorDashboard,
  getDirectorLeadPipelineMatrix,
  getDirectorLeadSourceBreakdown,
} from "./director-dashboard.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";

export const dashboardRouter = Router();

const directorDashboardQuerySchema = z.object({
  majorId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sourceId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  assigneeId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  pipelineStageId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  filterOperator: z.enum(["EQUALS", "NOT_EQUALS"]).optional(),
  timePreset: z.enum(["LAST_7_DAYS", "THIS_WEEK", "LAST_WEEK", "THIS_MONTH", "LAST_MONTH", "THIS_QUARTER", "LAST_QUARTER", "CUSTOM"]).optional(),
  fromDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
  toDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
}).refine((input) => !input.fromDate || !input.toDate || input.toDate >= input.fromDate, {
  message: "Khoảng ngày dashboard không hợp lệ.",
});

dashboardRouter.get(
  "/director/lead-source-breakdown",
  requireAuthentication,
  requireAnyPermission("dashboard.view_all"),
  async (request, response, next) => {
    try {
      const parsed = directorDashboardQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Bộ lọc bảng phân bổ theo nguồn không hợp lệ." });
        return;
      }
      response.json(await getDirectorLeadSourceBreakdown(getInstitutionProgramScope(request), parsed.data));
    } catch (error) {
      next(error);
    }
  },
);

dashboardRouter.get(
  "/director/lead-pipeline-matrix",
  requireAuthentication,
  requireAnyPermission("dashboard.view_all"),
  async (request, response, next) => {
    try {
      const parsed = directorDashboardQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Bộ lọc bảng phân bổ không hợp lệ." });
        return;
      }
      response.json(await getDirectorLeadPipelineMatrix(getInstitutionProgramScope(request), parsed.data));
    } catch (error) {
      next(error);
    }
  },
);

dashboardRouter.get(
  "/director",
  requireAuthentication,
  requireAnyPermission("dashboard.view_all"),
  async (request, response, next) => {
    try {
      const parsed = directorDashboardQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Bộ lọc dashboard không hợp lệ." });
        return;
      }
      response.json(await getDirectorDashboard(getInstitutionProgramScope(request), parsed.data));
    } catch (error) {
      next(error);
    }
  },
);
