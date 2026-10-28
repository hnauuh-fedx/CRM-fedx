import { z } from "zod";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { getMarketingFormVisibility } from "./marketing-form-scope";
import { recordDataExport } from "../notifications/data-export-notification.service";

export const marketingFormReportPermissions = ["report.view_all", "report.marketing.view", "report.marketing.view_own"];
export const marketingFormReportQuerySchema = z.object({
  fromDate: z.iso.date().optional().or(z.literal("")).transform((v) => v || undefined),
  toDate: z.iso.date().optional().or(z.literal("")).transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).refine((v) => !v.fromDate || !v.toDate || v.fromDate <= v.toDate, { message: "Khoảng ngày không hợp lệ." });
export type MarketingFormReportQuery = { page: number; limit: number; fromDate?: string; toDate?: string };

export async function getMarketingFormReport(user: AuthUser, formId: string, query: MarketingFormReportQuery) {
  if (!marketingFormReportPermissions.some((p) => user.permissions.includes(p))) return { ok: false as const, reason: "permission_denied" as const };
  const parsed = marketingFormReportQuerySchema.safeParse(query);
  if (!parsed.success) return { ok: false as const, reason: "invalid_query" as const };
  query = parsed.data;
  const form = await prisma.marketing_forms.findFirst({
    where: { id: formId, AND: getMarketingFormVisibility(user) },
    select: { id: true, name: true, institution_program_id: true },
  });
  if (!form?.institution_program_id) return { ok: false as const, reason: "form_not_found" as const };
  // Date filters are inclusive calendar days in Vietnam; stored timestamps are UTC.
  const submissions: Prisma.marketing_form_submissionsWhereInput = {
    marketing_form_id: formId,
    created_at: {
      ...(query.fromDate ? { gte: new Date(`${query.fromDate}T00:00:00+07:00`) } : {}),
      ...(query.toDate ? { lt: new Date(new Date(`${query.toDate}T00:00:00+07:00`).getTime() + 86400000) } : {}),
    },
  };
  const canViewLeads = ["lead.view_all", "lead.view_department", "lead.view_assigned", "lead.view_own"].some((p) => user.permissions.includes(p));
  const leadWhere: Prisma.leadsWhereInput = {
    AND: [{ deleted_at: null }, getLeadScopeWhere(user, form.institution_program_id),
      { institution_program_id: form.institution_program_id, marketing_form_submissions: { some: submissions } }],
  };
  const [statuses, newLeads, pipelines] = await prisma.$transaction(async (tx) => Promise.all([
    tx.marketing_form_submissions.groupBy({ by: ["status"], where: submissions, _count: { _all: true }, orderBy: { status: "asc" } }),
    tx.marketing_form_submissions.count({ where: { ...submissions, OR: [
      { configuration_snapshot: { path: ["processingOutcome"], equals: "created_lead" } },
      { status: "processed", lead_id: { not: null }, OR: [
        { configuration_snapshot: { equals: Prisma.DbNull } },
        { configuration_snapshot: { path: ["processingOutcome"], equals: Prisma.AnyNull } },
      ] },
    ] } }),
    canViewLeads ? tx.leads.groupBy({ by: ["pipeline_stage_id"], where: leadWhere, _count: { _all: true }, orderBy: { pipeline_stage_id: "asc" } }) : Promise.resolve([]),
  ]), { isolationLevel: "RepeatableRead" });
  const counts = new Map(statuses.map((s) => [s.status, s._count._all]));
  const count = (status: string) => counts.get(status) ?? 0;
  const summary = {
    total: statuses.reduce((n, s) => n + s._count._all, 0),
    accepted: ["processed", "updated", "linked", "duplicate", "needs_review", "ignored"].reduce((n, s) => n + count(s), 0),
    failed: count("failed"), duplicate: count("duplicate") + count("updated") + count("linked") + count("needs_review"),
    needsReview: count("needs_review"), newLeads, updatedLeads: count("updated"),
  };
  const pageItems = pipelines.slice((query.page - 1) * query.limit, query.page * query.limit);
  const stages = await prisma.pipeline_stages.findMany({ where: { id: { in: pageItems.flatMap((p) => p.pipeline_stage_id ? [p.pipeline_stage_id] : []) } }, select: { id: true, name: true } });
  return { ok: true as const, data: {
    form: { id: form.id, name: form.name, institutionProgramId: form.institution_program_id }, summary,
    statuses: statuses.map((s) => ({ status: s.status, count: s._count._all })),
    pipeline: pageItems.map((p) => ({ stageId: p.pipeline_stage_id, name: stages.find((s) => s.id === p.pipeline_stage_id)?.name ?? "Chưa có giai đoạn", leadCount: p._count._all })),
    pipelineVisible: canViewLeads,
    pagination: { page: query.page, limit: query.limit, total: pipelines.length, totalPages: Math.max(1, Math.ceil(pipelines.length / query.limit)) },
    filters: { fromDate: query.fromDate ?? "", toDate: query.toDate ?? "" },
    definitions: "Ngày theo múi giờ Việt Nam. Lead mới theo kết quả tạo Lead lưu lúc gửi; legacy thiếu kết quả dùng processed có Lead và có thể thiếu sau khi gỡ Lead. Cập nhật: updated. Duplicate gồm duplicate/updated/linked/needs_review. Legacy duplicate không suy đoán số lần cập nhật. Pipeline hiện tại đếm Lead duy nhất trong scope, không phải lịch sử tại lúc gửi. Không đo opened/start.",
  } };
}

export function marketingFormReportCsv(data: Extract<Awaited<ReturnType<typeof getMarketingFormReport>>, { ok: true }>["data"]) {
  const metricLabels: Record<string, string> = { total: "Tổng phản hồi", accepted: "Đã tiếp nhận", failed: "Lỗi", duplicate: "Khớp Lead có sẵn / cần xử lý", needsReview: "Cần xử lý trùng", newLeads: "Lead mới", updatedLeads: "Phản hồi cập nhật Lead" };
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return `"${(/^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  };
  const rows: unknown[][] = [["Biểu mẫu", data.form.name], ["Từ ngày", data.filters.fromDate], ["Đến ngày", data.filters.toDate], ["Chỉ số", "Số lượng"],
    ...Object.entries(data.summary).map(([key, count]) => [metricLabels[key], count]), ["Trạng thái", "Số phản hồi"], ...data.statuses.map((s) => [s.status, s.count]),
    ["Pipeline hiện tại (trang đã chọn)", "Lead duy nhất"], ...data.pipeline.map((s) => [s.name, s.leadCount]), ["Định nghĩa", data.definitions]];
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export async function exportMarketingFormReport(user: AuthUser, formId: string, query: MarketingFormReportQuery, ipAddress?: string) {
  if (!user.permissions.includes("report.personal.export")) return { ok: false as const, reason: "permission_denied" as const };
  const report = await getMarketingFormReport(user, formId, query);
  if (!report.ok) return report;
  const csv = marketingFormReportCsv(report.data);
  await recordDataExport(user, {
    institutionProgramId: report.data.form.institutionProgramId,
    label: "báo cáo biểu mẫu marketing",
    count: Object.keys(report.data.summary).length + report.data.statuses.length + report.data.pipeline.length,
    format: "csv",
    entityType: "marketing_form",
    entityId: formId,
    action: "export_aggregate_report",
    metadata: { ...report.data.filters, page: query.page },
  }, ipAddress);
  return { ok: true as const, data: csv };
}
