import { Router, type Response } from "express";
import * as XLSX from "xlsx";
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
import { createMetabaseGuestToken, getMetabaseDashboardCatalog } from "./metabase-embed.service";
import {
  archivePersonalReport,
  createPersonalReport,
  executePersonalReport,
  getPersonalReportFilterValues,
  listPersonalReports,
  setPersonalReportSharing,
  updatePersonalReport,
  validatePersonalReportInput,
} from "./personal-report.service";
import { getPersonalReportOptions } from "./report-definitions";
import {
  getPersonalDashboard,
  getPersonalDashboardConfig,
  updatePersonalDashboardConfig,
} from "./personal-dashboard.service";

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
const personalReportInputSchema = z.object({
  name: z.string().trim().min(3).max(255),
  module: z.enum(["MARKETING", "SALE", "ADMISSION", "STUDENT"]),
  metricKeys: z.array(z.string().min(1).max(80)).min(1).max(6),
  breakdownKey: z.string().min(1).max(80).nullable().optional(),
  chartType: z.enum(["BAR", "TABLE", "KPI"]),
  fromDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
  toDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
  mode: z.enum(["SUMMARY", "SINGLE", "PIVOT"]).default("SUMMARY"),
  datasetKey: z.enum(["LEADS", "ADMISSION_CANDIDATES", "STUDENTS"]).optional(),
  rowDimensionKey: z.string().min(1).max(80).optional(),
  columnDimensionKey: z.string().min(1).max(80).optional(),
  timePreset: z.enum(["LAST_7_DAYS", "THIS_WEEK", "LAST_WEEK", "THIS_MONTH", "LAST_MONTH", "THIS_QUARTER", "LAST_QUARTER", "CUSTOM"]).optional(),
  dateGranularity: z.enum(["DAY", "WEEK", "MONTH", "QUARTER"]).optional(),
  singleDimensionKey: z.string().min(1).max(80).optional(),
  singleDisplay: z.enum(["TABLE", "LINE"]).optional(),
  conditions: z.array(z.object({
    fieldKey: z.string().min(1).max(80),
    operator: z.enum(["EQUALS", "NOT_EQUALS", "DATE_PRESET", "DATE_BETWEEN"]),
    value: z.string().max(255).optional(),
    fromDate: z.iso.date().optional(),
    toDate: z.iso.date().optional(),
  })).max(5).optional(),
}).refine((input) => !input.fromDate || !input.toDate || input.toDate >= input.fromDate, {
  message: "Khoảng ngày báo cáo không hợp lệ.",
});
const idSchema = z.uuid();
const paginationSchema = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });
const dashboardFilterConditionSchema = z.object({
  fieldKey: z.string().min(1).max(80),
  operator: z.enum(["EQUALS", "NOT_EQUALS", "DATE_PRESET", "DATE_BETWEEN"]),
  value: z.string().max(255).optional(),
  fromDate: z.iso.date().optional(),
  toDate: z.iso.date().optional(),
});
const dashboardKpiBaseSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().max(120).optional(),
  conditions: z.array(dashboardFilterConditionSchema).max(5),
});
const dashboardKpiSchema = z.discriminatedUnion("type", [
  dashboardKpiBaseSchema.extend({ type: z.literal("COUNT"), datasetKey: z.enum(["LEADS", "ADMISSION_CANDIDATES", "STUDENTS"]) }),
  dashboardKpiBaseSchema.extend({ type: z.literal("TREND"), datasetKey: z.enum(["LEADS", "ADMISSION_CANDIDATES", "STUDENTS"]), comparisonPeriod: z.enum(["WEEK", "MONTH", "QUARTER"]) }),
  dashboardKpiBaseSchema.extend({ type: z.literal("CONVERSION"), datasetKey: z.literal("LEADS"), sourceStageId: z.uuid(), targetStageId: z.uuid() }),
]);
const dashboardConfigSchema = z.object({
  reportIds: z.array(z.uuid()).max(12),
  columnCount: z.number().int().min(1).max(5).optional(),
  kpiWidgets: z.array(dashboardKpiSchema).min(1).max(12).optional(),
}).refine((input) => (input.columnCount === undefined) === (input.kpiWidgets === undefined));

function sendPersonalReportValidationError(response: Response, reason: string) {
  const forbidden = reason === "module_forbidden" || reason === "program_forbidden";
  return response.status(forbidden ? 403 : 400).json({
    message: forbidden
      ? "Bạn không được tạo báo cáo cho module hoặc chương trình này."
      : "Cấu hình bảng thống kê không hợp lệ hoặc khoảng thời gian quá lớn.",
  });
}

reportsRouter.get("/metabase/dashboards", requireAuthentication, async (request, response) => {
  response.json({ items: getMetabaseDashboardCatalog(request.authUser!) });
});

reportsRouter.post("/metabase/guest-token", requireAuthentication, async (request, response) => {
  const parsed = z.object({ dashboardKey: z.literal("sale-pipeline") }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "Dashboard báo cáo không hợp lệ." });
  const institutionProgramId = getInstitutionProgramScope(request);
  if (!institutionProgramId) return response.status(400).json({ message: "Vui lòng chọn chương trình tuyển sinh trước khi mở dashboard." });
  const result = createMetabaseGuestToken(request.authUser!, parsed.data.dashboardKey, institutionProgramId);
  if (!result.ok) return response.status(result.reason === "unavailable" ? 503 : 403).json({ message: result.reason === "unavailable" ? "Metabase chưa được cấu hình trên máy chủ." : "Bạn không có quyền mở dashboard này." });
  return response.json(result.data);
});

reportsRouter.get("/personal/options", requireAuthentication, requireAnyPermission("report.personal.view"), async (request, response) => {
  response.json(getPersonalReportOptions(request.authUser!));
});

reportsRouter.get("/personal/filter-values", requireAuthentication, requireAnyPermission("report.personal.view"), async (request, response) => {
  const parsed = z.object({
    datasetKey: z.enum(["LEADS", "ADMISSION_CANDIDATES", "STUDENTS"]),
    fieldKey: z.string().min(1).max(80),
  }).safeParse(request.query);
  if (!parsed.success) return response.status(400).json({ message: "Trường lọc không hợp lệ." });
  const institutionProgramId = getInstitutionProgramScope(request);
  if (!institutionProgramId) return response.status(403).json({ message: "Bạn chưa được cấp phạm vi chương trình tuyển sinh." });
  const items = await getPersonalReportFilterValues(request.authUser!, parsed.data.datasetKey, parsed.data.fieldKey, institutionProgramId);
  return items ? response.json({ items }) : response.status(403).json({ message: "Bạn không được sử dụng trường lọc này." });
});

reportsRouter.get("/personal", requireAuthentication, requireAnyPermission("report.personal.view"), async (request, response) => {
  const parsed = paginationSchema.safeParse(request.query);
  if (!parsed.success) return response.status(400).json({ message: "Phân trang báo cáo không hợp lệ." });
  return response.json(await listPersonalReports(request.authUser!, parsed.data.page, parsed.data.limit));
});

reportsRouter.get("/personal/dashboard/config", requireAuthentication, requireAnyPermission("report.personal.view"), async (request, response) => {
  const institutionProgramId = getInstitutionProgramScope(request);
  if (!institutionProgramId) return response.status(403).json({ message: "Bạn chưa được cấp phạm vi chương trình tuyển sinh." });
  const config = await getPersonalDashboardConfig(request.authUser!, institutionProgramId);
  return config ? response.json(config) : response.status(403).json({ message: "Bạn không được quản lý dashboard của chương trình này." });
});

reportsRouter.put("/personal/dashboard/config", requireAuthentication, requireAnyPermission("report.personal.update"), async (request, response) => {
  const body = dashboardConfigSchema.safeParse(request.body);
  if (!body.success || new Set(body.data.reportIds).size !== body.data.reportIds.length) {
    return response.status(400).json({ message: "Cấu hình dashboard không hợp lệ hoặc có báo cáo bị trùng." });
  }
  const institutionProgramId = getInstitutionProgramScope(request);
  if (!institutionProgramId) return response.status(403).json({ message: "Bạn chưa được cấp phạm vi chương trình tuyển sinh." });
  const customization = body.data.columnCount && body.data.kpiWidgets
    ? { columnCount: body.data.columnCount, kpiWidgets: body.data.kpiWidgets }
    : undefined;
  const config = await updatePersonalDashboardConfig(request.authUser!, institutionProgramId, body.data.reportIds, customization, request.ip);
  return config ? response.json(config) : response.status(403).json({ message: "Dashboard chứa báo cáo ngoài phạm vi hoặc vượt quá giới hạn cho phép." });
});

reportsRouter.get("/personal/dashboard", requireAuthentication, requireAnyPermission("report.personal.view"), async (request, response) => {
  const institutionProgramId = getInstitutionProgramScope(request);
  if (!institutionProgramId) return response.status(403).json({ message: "Bạn chưa được cấp phạm vi chương trình tuyển sinh." });
  const dashboard = await getPersonalDashboard(request.authUser!, institutionProgramId);
  return dashboard ? response.json(dashboard) : response.status(403).json({ message: "Bạn không được xem dashboard của chương trình này." });
});

reportsRouter.post("/personal", requireAuthentication, requireAnyPermission("report.personal.create"), async (request, response) => {
  const parsed = personalReportInputSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "Cấu hình báo cáo thống kê không hợp lệ." });
  const institutionProgramId = getInstitutionProgramScope(request);
  if (!institutionProgramId) return response.status(403).json({ message: "Bạn chưa được cấp phạm vi chương trình tuyển sinh." });
  const input = { ...parsed.data, institutionProgramId };
  const validation = validatePersonalReportInput(request.authUser!, input);
  if (!validation.ok) return sendPersonalReportValidationError(response, validation.reason);
  return response.status(201).json(await createPersonalReport(request.authUser!, input, request.ip));
});

reportsRouter.patch("/personal/:id", requireAuthentication, requireAnyPermission("report.personal.update"), async (request, response) => {
  const id = idSchema.safeParse(request.params.id);
  const body = personalReportInputSchema.safeParse(request.body);
  if (!id.success || !body.success) return response.status(400).json({ message: "Cấu hình báo cáo thống kê không hợp lệ." });
  const institutionProgramId = getInstitutionProgramScope(request);
  if (!institutionProgramId) return response.status(403).json({ message: "Bạn chưa được cấp phạm vi chương trình tuyển sinh." });
  const input = { ...body.data, institutionProgramId };
  const validation = validatePersonalReportInput(request.authUser!, input);
  if (!validation.ok) return sendPersonalReportValidationError(response, validation.reason);
  const report = await updatePersonalReport(request.authUser!, id.data, input, request.ip);
  return report ? response.json(report) : response.status(404).json({ message: "Không tìm thấy báo cáo thuộc quyền sở hữu của bạn." });
});

reportsRouter.patch("/personal/:id/sharing", requireAuthentication, requireAnyPermission("report.personal.share"), async (request, response) => {
  const id = idSchema.safeParse(request.params.id);
  const body = z.object({ isShared: z.boolean() }).safeParse(request.body);
  if (!id.success || !body.success) return response.status(400).json({ message: "Thiết lập chia sẻ không hợp lệ." });
  const report = await setPersonalReportSharing(request.authUser!, id.data, body.data.isShared, request.ip);
  return report ? response.json(report) : response.status(404).json({ message: "Không tìm thấy báo cáo thuộc quyền sở hữu của bạn." });
});

reportsRouter.delete("/personal/:id", requireAuthentication, requireAnyPermission("report.personal.update"), async (request, response) => {
  const id = idSchema.safeParse(request.params.id);
  if (!id.success) return response.status(400).json({ message: "Mã báo cáo không hợp lệ." });
  return (await archivePersonalReport(request.authUser!, id.data, request.ip)) ? response.status(204).send() : response.status(404).json({ message: "Không tìm thấy báo cáo thuộc quyền sở hữu của bạn." });
});

reportsRouter.get("/personal/:id/result", requireAuthentication, requireAnyPermission("report.personal.view"), async (request, response) => {
  const id = idSchema.safeParse(request.params.id);
  if (!id.success) return response.status(400).json({ message: "Mã báo cáo không hợp lệ." });
  const result = await executePersonalReport(request.authUser!, id.data);
  return result ? response.json(result) : response.status(404).json({ message: "Không tìm thấy báo cáo trong phạm vi của bạn." });
});

reportsRouter.get("/personal/:id/export", requireAuthentication, requireAnyPermission("report.personal.export"), async (request, response) => {
  const id = idSchema.safeParse(request.params.id);
  const format = z.enum(["csv", "xlsx"]).safeParse(request.query.format);
  if (!id.success || !format.success) return response.status(400).json({ message: "Yêu cầu xuất báo cáo không hợp lệ." });
  const result = await executePersonalReport(request.authUser!, id.data);
  if (!result) return response.status(404).json({ message: "Không tìm thấy báo cáo trong phạm vi của bạn." });
  const rows = result.pivot
    ? [
        ...result.pivot.rows.map((item) => ({
          [result.pivot!.rowLabel]: item.label,
          ...Object.fromEntries(result.pivot!.columns.map((column) => [column.label, item.values[column.key] ?? 0])),
          Tổng: item.total,
        })),
        {
          [result.pivot.rowLabel]: "Tổng",
          ...Object.fromEntries(result.pivot.columns.map((column) => [column.label, result.pivot!.columnTotals[column.key] ?? 0])),
          Tổng: result.pivot.grandTotal,
        },
      ]
    : [
        ...result.summary.map((item) => ({ "Chỉ số": item.label, "Nhóm": "Tổng quan", "Giá trị": item.value })),
        ...result.rows.map((item) => ({ "Chỉ số": item.label, "Nhóm": "Phân tích", "Giá trị": item.value, ...(item.percentage !== undefined ? { "Tỷ lệ (%)": item.percentage } : {}) })),
      ];
  const safeName = result.report!.name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "bao-cao-kpi";
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (format.data === "csv") {
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${safeName}.csv"`);
    return response.send(`\uFEFF${XLSX.utils.sheet_to_csv(sheet)}`);
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "KPI");
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.setHeader("Content-Disposition", `attachment; filename="${safeName}.xlsx"`);
  return response.send(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
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
  requireAnyPermission("report.view_all", "report.sale.view_department", "report.sale.view_assigned"),
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
  requireAnyPermission("report.view_all", "report.admission.view", "admission.view_all", "admission.view"),
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
  requireAnyPermission("report.view_all", "report.student.view", "student.view_all", "student.view"),
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
