import { Prisma } from "../../generated/prisma/client";

import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import {
  canUseReportModule,
  personalReportDatasetDefinitions,
  personalReportDefinitions,
  type PersonalReportDatasetKey,
  type PersonalReportFilterCondition,
  type PersonalReportModule,
} from "./report-definitions";
import { resolveMetabaseScopeKeys } from "./metabase-embed.service";
import {
  conditionSql,
  datasetFrom,
  executePersonalReport,
  rawFieldExpression,
  recordIdExpression,
  resolvePersonalReportDateRange,
  validateConditions,
} from "./personal-report.service";

const maximumDashboardWidgets = 12;
const maximumDashboardKpis = 12;

export type DashboardKpiWidgetType = "COUNT" | "CONVERSION" | "TREND";
export type DashboardComparisonPeriod = "WEEK" | "MONTH" | "QUARTER";
export type DashboardKpiWidgetInput = {
  id: string;
  type: DashboardKpiWidgetType;
  title?: string;
  datasetKey: PersonalReportDatasetKey;
  conditions: PersonalReportFilterCondition[];
  sourceStageId?: string;
  targetStageId?: string;
  comparisonPeriod?: DashboardComparisonPeriod;
};
export type PersonalDashboardCustomization = { columnCount: number; kpiWidgets: DashboardKpiWidgetInput[] };

type PipelineStageOption = { id: string; name: string; position: number | null; pipelineId: string | null; pipelineName: string | null };
type CountRow = { total: bigint | number };
type TrendRow = { current_total: bigint | number; previous_total: bigint | number };
type ConversionRow = { source_total: bigint | number; target_total: bigint | number };

export async function getPersonalDashboardConfig(user: AuthUser, institutionProgramId: string) {
  if (!user.institutionProgramIds.includes(institutionProgramId)) return null;
  const allowedModules = allowedReportModules(user);
  const [widgets, settings, pipelineStages] = await Promise.all([
    prisma.personal_dashboard_widgets.findMany({
      where: {
        user_id: user.id,
        institution_program_id: institutionProgramId,
        personal_reports: { archived_at: null, module: { in: allowedModules }, OR: [{ owner_id: user.id }, { is_shared: true }] },
      },
      select: { personal_report_id: true },
      orderBy: [{ display_order: "asc" }, { id: "asc" }],
      take: maximumDashboardWidgets,
    }),
    prisma.personal_dashboard_settings.findUnique({
      where: { user_id_institution_program_id: { user_id: user.id, institution_program_id: institutionProgramId } },
      select: { column_count: true, kpi_widgets: true },
    }),
    canUseReportModule(user, "SALE") ? getPipelineStageOptions() : Promise.resolve([]),
  ]);
  return {
    reportIds: widgets.map((widget) => widget.personal_report_id),
    maximumWidgets: maximumDashboardWidgets,
    maximumKpis: maximumDashboardKpis,
    columnCount: settings?.column_count ?? 4,
    kpiWidgets: settings ? parseStoredKpiWidgets(settings.kpi_widgets) : defaultKpiWidgets(user),
    pipelineStages,
  };
}

export async function updatePersonalDashboardConfig(
  user: AuthUser,
  institutionProgramId: string,
  reportIds: string[],
  customization?: PersonalDashboardCustomization,
  ipAddress?: string,
) {
  if (!user.institutionProgramIds.includes(institutionProgramId) || reportIds.length > maximumDashboardWidgets) return null;
  const uniqueIds = [...new Set(reportIds)];
  if (uniqueIds.length !== reportIds.length || (customization && !(await validateDashboardCustomization(user, customization)))) return null;
  const allowedModules = allowedReportModules(user);
  const visibleReports = uniqueIds.length === 0 ? [] : await prisma.personal_reports.findMany({
    where: {
      id: { in: uniqueIds }, institution_program_id: institutionProgramId, archived_at: null,
      module: { in: allowedModules }, OR: [{ owner_id: user.id }, { is_shared: true }],
    },
    select: { id: true },
  });
  if (visibleReports.length !== uniqueIds.length) return null;

  const [previousWidgets, previousSettings] = await Promise.all([
    prisma.personal_dashboard_widgets.findMany({
      where: { user_id: user.id, institution_program_id: institutionProgramId },
      select: { personal_report_id: true }, orderBy: [{ display_order: "asc" }, { id: "asc" }],
    }),
    prisma.personal_dashboard_settings.findUnique({
      where: { user_id_institution_program_id: { user_id: user.id, institution_program_id: institutionProgramId } },
      select: { column_count: true, kpi_widgets: true },
    }),
  ]);
  await prisma.$transaction(async (transaction) => {
    await transaction.personal_dashboard_widgets.deleteMany({ where: { user_id: user.id, institution_program_id: institutionProgramId } });
    if (uniqueIds.length > 0) {
      await transaction.personal_dashboard_widgets.createMany({
        data: uniqueIds.map((personalReportId, displayOrder) => ({ user_id: user.id, institution_program_id: institutionProgramId, personal_report_id: personalReportId, display_order: displayOrder })),
      });
    }
    if (customization) {
      await transaction.personal_dashboard_settings.upsert({
        where: { user_id_institution_program_id: { user_id: user.id, institution_program_id: institutionProgramId } },
        update: { column_count: customization.columnCount, kpi_widgets: customization.kpiWidgets as unknown as Prisma.InputJsonValue, updated_at: new Date() },
        create: { user_id: user.id, institution_program_id: institutionProgramId, column_count: customization.columnCount, kpi_widgets: customization.kpiWidgets as unknown as Prisma.InputJsonValue },
      });
    }
    await transaction.audit_logs.create({
      data: {
        user_id: user.id, entity_type: "personal_dashboard", entity_id: user.id, action: "update_widgets", ip_address: ipAddress,
        old_data: { institutionProgramId, reportIds: previousWidgets.map((item) => item.personal_report_id), columnCount: previousSettings?.column_count, kpiWidgets: previousSettings?.kpi_widgets },
        new_data: { institutionProgramId, reportIds: uniqueIds, columnCount: customization?.columnCount ?? previousSettings?.column_count, kpiWidgets: customization?.kpiWidgets ?? previousSettings?.kpi_widgets },
      },
    });
  });
  return getPersonalDashboardConfig(user, institutionProgramId);
}

export async function getPersonalDashboard(user: AuthUser, institutionProgramId: string) {
  const config = await getPersonalDashboardConfig(user, institutionProgramId);
  if (!config) return null;
  const [widgets, kpiWidgets] = await Promise.all([
    Promise.all(config.reportIds.map(async (reportId) => {
      const result = await executePersonalReport(user, reportId);
      return result ? { reportId, result } : null;
    })).then((items) => items.filter((item): item is NonNullable<typeof item> => item !== null)),
    Promise.all(config.kpiWidgets.map((widget) => executeKpiWidget(user, institutionProgramId, widget, config.pipelineStages))),
  ]);
  return { ...config, kpiConfig: config.kpiWidgets, widgets, kpiWidgets };
}

async function validateDashboardCustomization(user: AuthUser, customization: PersonalDashboardCustomization) {
  if (!Number.isInteger(customization.columnCount) || customization.columnCount < 1 || customization.columnCount > 5) return false;
  if (customization.kpiWidgets.length < 1 || customization.kpiWidgets.length > maximumDashboardKpis) return false;
  if (new Set(customization.kpiWidgets.map((widget) => widget.id)).size !== customization.kpiWidgets.length) return false;
  const stages = await getPipelineStageOptions();
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  return customization.kpiWidgets.every((widget) => {
    const dataset = personalReportDatasetDefinitions[widget.datasetKey];
    if (!dataset || !canUseReportModule(user, dataset.module) || !validateConditions(dataset, widget.conditions)) return false;
    if (widget.title && widget.title.trim().length > 120) return false;
    if (widget.type === "COUNT") return true;
    if (widget.type === "TREND") {
      return ["WEEK", "MONTH", "QUARTER"].includes(widget.comparisonPeriod ?? "")
        && widget.conditions.every((condition) => dataset.filterFields.find((field) => field.key === condition.fieldKey)?.type !== "DATE");
    }
    if (widget.type !== "CONVERSION" || widget.datasetKey !== "LEADS" || !widget.sourceStageId || !widget.targetStageId) return false;
    const source = stageById.get(widget.sourceStageId);
    const target = stageById.get(widget.targetStageId);
    return Boolean(source && target && source.id !== target.id && source.pipelineId === target.pipelineId
      && (source.position ?? Number.MAX_SAFE_INTEGER) < (target.position ?? Number.MAX_SAFE_INTEGER));
  });
}

async function executeKpiWidget(user: AuthUser, institutionProgramId: string, widget: DashboardKpiWidgetInput, stages: PipelineStageOption[]) {
  const dataset = personalReportDatasetDefinitions[widget.datasetKey];
  const scopeKeys = resolveMetabaseScopeKeys(user);
  if (!dataset || !canUseReportModule(user, dataset.module) || scopeKeys.length === 0 || !validateConditions(dataset, widget.conditions)) return unavailableWidget(widget);
  if (widget.type === "TREND" && widget.conditions.some((condition) => dataset.filterFields.find((field) => field.key === condition.fieldKey)?.type === "DATE")) return unavailableWidget(widget);
  if (widget.type === "CONVERSION") return executeConversionWidget(widget, institutionProgramId, scopeKeys, stages);
  if (widget.type === "TREND") return executeTrendWidget(widget, institutionProgramId, scopeKeys);
  const [row] = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(DISTINCT ${recordIdExpression(widget.datasetKey)})::bigint AS total
    FROM ${datasetFrom(widget.datasetKey)}
    WHERE ${dashboardWhere(widget, institutionProgramId, scopeKeys)}
  `);
  return {
    id: widget.id, type: widget.type,
    title: normalizedTitle(widget.title) ?? `Tổng số ${dataset.label.toLocaleLowerCase("vi")}`,
    description: describeFilters(widget, "Toàn bộ dữ liệu trong phạm vi được cấp"),
    value: Number(row?.total ?? 0), format: "NUMBER" as const, trend: null,
  };
}

async function executeTrendWidget(widget: DashboardKpiWidgetInput, institutionProgramId: string, scopeKeys: string[]) {
  const dataset = personalReportDatasetDefinitions[widget.datasetKey];
  const period = widget.comparisonPeriod ?? "MONTH";
  const ranges = comparisonRanges(period);
  const dateExpression = rawFieldExpression(widget.datasetKey, dataset.primaryDateField);
  const [row] = await prisma.$queryRaw<TrendRow[]>(Prisma.sql`
    SELECT
      COUNT(DISTINCT ${recordIdExpression(widget.datasetKey)}) FILTER (WHERE ${dateExpression} BETWEEN ${ranges.current.fromDate}::date AND ${ranges.current.toDate}::date)::bigint AS current_total,
      COUNT(DISTINCT ${recordIdExpression(widget.datasetKey)}) FILTER (WHERE ${dateExpression} BETWEEN ${ranges.previous.fromDate}::date AND ${ranges.previous.toDate}::date)::bigint AS previous_total
    FROM ${datasetFrom(widget.datasetKey)}
    WHERE ${dashboardWhere(widget, institutionProgramId, scopeKeys)}
  `);
  const current = Number(row?.current_total ?? 0);
  const previous = Number(row?.previous_total ?? 0);
  const change = previous === 0 ? (current === 0 ? 0 : 100) : Number((((current - previous) / previous) * 100).toFixed(1));
  const direction = change > 0 ? "UP" as const : change < 0 ? "DOWN" as const : "FLAT" as const;
  const labels = comparisonLabels(period);
  return {
    id: widget.id, type: widget.type,
    title: normalizedTitle(widget.title) ?? `${dataset.label} ${labels.current}`,
    description: describeFilters(widget, `Đang so sánh ${labels.current} với ${labels.previous}`),
    value: current, format: "NUMBER" as const,
    trend: { direction, percentageChange: Math.abs(change), previousLabel: labels.previous },
  };
}

async function executeConversionWidget(widget: DashboardKpiWidgetInput, institutionProgramId: string, scopeKeys: string[], stages: PipelineStageOption[]) {
  const source = stages.find((stage) => stage.id === widget.sourceStageId);
  const target = stages.find((stage) => stage.id === widget.targetStageId);
  if (!source || !target) return unavailableWidget(widget);
  const [row] = await prisma.$queryRaw<ConversionRow[]>(Prisma.sql`
    WITH scoped_leads AS (
      SELECT DISTINCT fact.lead_id FROM reporting.sale_pipeline_scope_fact fact
      WHERE ${dashboardWhere(widget, institutionProgramId, scopeKeys)}
    ), stage_reaches AS (
      SELECT lead.id AS lead_id, lead.pipeline_stage_id AS stage_id, COALESCE(lead.updated_at, lead.created_at) AS reached_at
      FROM leads lead JOIN scoped_leads scoped ON scoped.lead_id = lead.id WHERE lead.pipeline_stage_id IS NOT NULL
      UNION ALL
      SELECT history.lead_id, history.to_stage_id, history.changed_at
      FROM lead_status_histories history JOIN scoped_leads scoped ON scoped.lead_id = history.lead_id WHERE history.to_stage_id IS NOT NULL
      UNION ALL
      SELECT history.lead_id, history.from_stage_id, history.changed_at
      FROM lead_status_histories history JOIN scoped_leads scoped ON scoped.lead_id = history.lead_id WHERE history.from_stage_id IS NOT NULL
    ), source_reaches AS (
      SELECT lead_id, MIN(reached_at) AS reached_at FROM stage_reaches WHERE stage_id = ${source.id}::uuid GROUP BY lead_id
    ), converted_leads AS (
      SELECT DISTINCT source_reaches.lead_id
      FROM source_reaches
      JOIN stage_reaches target_reaches
        ON target_reaches.lead_id = source_reaches.lead_id
       AND target_reaches.stage_id = ${target.id}::uuid
       AND target_reaches.reached_at >= source_reaches.reached_at
    )
    SELECT COUNT(*)::bigint AS source_total,
      COUNT(converted_leads.lead_id)::bigint AS target_total
    FROM source_reaches LEFT JOIN converted_leads USING (lead_id)
  `);
  const sourceTotal = Number(row?.source_total ?? 0);
  const targetTotal = Number(row?.target_total ?? 0);
  return {
    id: widget.id, type: widget.type,
    title: normalizedTitle(widget.title) ?? `Tỷ lệ chuyển đổi từ ${source.name} sang ${target.name}`,
    description: describeFilters(widget, `${targetTotal}/${sourceTotal} khách hàng đã chuyển từ ${source.name} sang ${target.name}`),
    value: percentage(targetTotal, sourceTotal), format: "PERCENT" as const, trend: null,
  };
}

function dashboardWhere(widget: DashboardKpiWidgetInput, institutionProgramId: string, scopeKeys: string[]) {
  const conditions = widget.conditions.map((condition) => conditionSql(widget.datasetKey, condition));
  return Prisma.sql`fact.scope_key IN (${Prisma.join(scopeKeys)}) AND fact.institution_program_id = ${institutionProgramId}::uuid
    ${conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, " AND ")}` : Prisma.empty}`;
}

function describeFilters(widget: DashboardKpiWidgetInput, fallback: string) {
  if (widget.conditions.length === 0) return fallback;
  const dataset = personalReportDatasetDefinitions[widget.datasetKey];
  const descriptions = widget.conditions.map((condition) => {
    const field = dataset.filterFields.find((item) => item.key === condition.fieldKey);
    if (!field) return null;
    if (condition.operator === "DATE_PRESET") return `${field.label}: ${datePresetLabel(condition.value)}`;
    if (condition.operator === "DATE_BETWEEN") return `${field.label}: từ ${formatDate(condition.fromDate)} đến ${formatDate(condition.toDate)}`;
    return `${field.label} ${condition.operator === "NOT_EQUALS" ? "không bằng" : "bằng"} “${condition.value ?? ""}”`;
  }).filter(Boolean);
  return `Bộ lọc: ${descriptions.join("; ")}`;
}

function comparisonRanges(period: DashboardComparisonPeriod) {
  const presets = period === "WEEK" ? ["THIS_WEEK", "LAST_WEEK"] as const
    : period === "QUARTER" ? ["THIS_QUARTER", "LAST_QUARTER"] as const
      : ["THIS_MONTH", "LAST_MONTH"] as const;
  return { current: resolvePersonalReportDateRange({ timePreset: presets[0] })!, previous: resolvePersonalReportDateRange({ timePreset: presets[1] })! };
}
function comparisonLabels(period: DashboardComparisonPeriod) {
  if (period === "WEEK") return { current: "tuần này", previous: "tuần trước" };
  if (period === "QUARTER") return { current: "quý này", previous: "quý trước" };
  return { current: "tháng này", previous: "tháng trước" };
}
function datePresetLabel(value?: string) {
  return ({ LAST_7_DAYS: "7 ngày gần nhất", THIS_WEEK: "tuần này", LAST_WEEK: "tuần trước", THIS_MONTH: "tháng này", LAST_MONTH: "tháng trước", THIS_QUARTER: "quý này", LAST_QUARTER: "quý trước" } as Record<string, string>)[value ?? ""] ?? "khoảng đã chọn";
}
function formatDate(value?: string) {
  if (!value) return "chưa chọn";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

async function getPipelineStageOptions(): Promise<PipelineStageOption[]> {
  const stages = await prisma.pipeline_stages.findMany({
    select: { id: true, name: true, position: true, pipeline_id: true, pipelines: { select: { name: true } } },
    orderBy: [{ pipeline_id: "asc" }, { position: "asc" }, { id: "asc" }],
  });
  return stages.map((stage) => ({ id: stage.id, name: stage.name, position: stage.position, pipelineId: stage.pipeline_id, pipelineName: stage.pipelines?.name ?? null }));
}

function defaultKpiWidgets(user: AuthUser): DashboardKpiWidgetInput[] {
  const widgets: DashboardKpiWidgetInput[] = [];
  const addCount = (id: string, datasetKey: PersonalReportDatasetKey) => {
    if (canUseReportModule(user, personalReportDatasetDefinitions[datasetKey].module)) widgets.push({ id, type: "COUNT", datasetKey, conditions: [] });
  };
  addCount("00000000-0000-4000-8000-000000000101", "LEADS");
  addCount("00000000-0000-4000-8000-000000000102", "ADMISSION_CANDIDATES");
  addCount("00000000-0000-4000-8000-000000000103", "STUDENTS");
  if (canUseReportModule(user, "SALE")) widgets.push({ id: "00000000-0000-4000-8000-000000000104", type: "TREND", datasetKey: "LEADS", comparisonPeriod: "MONTH", conditions: [] });
  return widgets;
}

function parseStoredKpiWidgets(value: Prisma.JsonValue): DashboardKpiWidgetInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !["COUNT", "CONVERSION", "TREND"].includes(String(record.type)) || !["LEADS", "ADMISSION_CANDIDATES", "STUDENTS"].includes(String(record.datasetKey))) return [];
    return [{
      id: record.id, type: record.type as DashboardKpiWidgetType, datasetKey: record.datasetKey as PersonalReportDatasetKey,
      title: typeof record.title === "string" ? record.title : undefined,
      conditions: Array.isArray(record.conditions) ? record.conditions as PersonalReportFilterCondition[] : [],
      sourceStageId: typeof record.sourceStageId === "string" ? record.sourceStageId : undefined,
      targetStageId: typeof record.targetStageId === "string" ? record.targetStageId : undefined,
      comparisonPeriod: ["WEEK", "MONTH", "QUARTER"].includes(String(record.comparisonPeriod)) ? record.comparisonPeriod as DashboardComparisonPeriod : undefined,
    }];
  }).slice(0, maximumDashboardKpis);
}

function normalizedTitle(value?: string) { return value?.trim() || null; }
function allowedReportModules(user: AuthUser) { return (Object.keys(personalReportDefinitions) as PersonalReportModule[]).filter((module) => canUseReportModule(user, module)); }
function percentage(numerator: number, denominator: number) { return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(1)); }
function unavailableWidget(widget: DashboardKpiWidgetInput) {
  return { id: widget.id, type: widget.type, title: normalizedTitle(widget.title) ?? "KPI không khả dụng", description: "Cấu hình không còn nằm trong phạm vi được cấp.", value: 0, format: "NUMBER" as const, trend: null };
}
