import { Router } from "express";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import { getOverviewReport, getOverviewReportOptions } from "./report-overview.service";
import {
  getAdmissionDetailReport,
  getMarketingDetailReport,
  getSaleDetailReport,
  getStudentDetailReport,
} from "./report-detail.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";

export const reportsRouter = Router();
const overviewQuerySchema = z.object({
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});
const detailQuerySchema = overviewQuerySchema.extend({
  fromDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
  toDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
}).refine((input) => !input.fromDate || !input.toDate || input.toDate >= input.fromDate, {
  message: "Khoang ngay bao cao khong hop le.",
});

reportsRouter.get(
  "/overview",
  requireAuthentication,
  requireAnyPermission("report.view_all"),
  async (request, response, next) => {
    try {
      const parsed = overviewQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham so bao cao khong hop le." });
        return;
      }
      response.json(await getOverviewReport(getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId));
    } catch (error) {
      next(error);
    }
  },
);

reportsRouter.get(
  "/overview/options",
  requireAuthentication,
  requireAnyPermission("report.view_all"),
  async (_request, response, next) => {
    try {
      response.json(await getOverviewReportOptions());
    } catch (error) {
      next(error);
    }
  },
);

reportsRouter.get(
  "/marketing-detail",
  requireAuthentication,
  requireAnyPermission("report.view_all", "report.marketing.view", "report.marketing.view_own"),
  async (request, response, next) => {
    try {
      const parsed = detailQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham so bao cao Marketing khong hop le." });
        return;
      }
      response.json(await getMarketingDetailReport(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId,
      }));
    } catch (error) {
      next(error);
    }
  },
);

reportsRouter.get(
  "/sale-detail",
  requireAuthentication,
  requireAnyPermission("report.view_all", "report.sale.view_department"),
  async (request, response, next) => {
    try {
      const parsed = detailQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham so bao cao Sale khong hop le." });
        return;
      }
      response.json(await getSaleDetailReport(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId,
      }));
    } catch (error) {
      next(error);
    }
  },
);

reportsRouter.get(
  "/admission-detail",
  requireAuthentication,
  requireAnyPermission("report.view_all", "admission.view_all", "admission.view"),
  async (request, response, next) => {
    try {
      const parsed = detailQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham so bao cao Tuyen sinh khong hop le." });
        return;
      }
      response.json(await getAdmissionDetailReport(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId,
      }));
    } catch (error) {
      next(error);
    }
  },
);

reportsRouter.get(
  "/student-detail",
  requireAuthentication,
  requireAnyPermission("report.view_all", "student.view_all", "student.view"),
  async (request, response, next) => {
    try {
      const parsed = detailQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham so bao cao Sinh vien khong hop le." });
        return;
      }
      response.json(await getStudentDetailReport(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId,
      }));
    } catch (error) {
      next(error);
    }
  },
);
