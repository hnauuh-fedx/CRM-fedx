import { Prisma } from "../../generated/prisma/client";

import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import {
  getAdmissionDetailReport,
  getMarketingDetailReport,
  getSaleDetailReport,
  getStudentDetailReport,
} from "./report-detail.service";
import {
  canUseReportModule,
  personalReportDatasetDefinitions,
  personalReportDefinitions,
  type PersonalReportChartType,
  type PersonalReportDateGranularity,
  type PersonalReportDatasetKey,
  type PersonalReportFilterCondition,
  type PersonalReportMode,
  type PersonalReportModule,
  type PersonalReportSingleDisplay,
  type PersonalReportTimePreset,
} from "./report-definitions";
import { resolveMetabaseScopeKeys } from "./metabase-embed.service";

export type PersonalReportInput = {
  name: string;
  module: PersonalReportModule;
  metricKeys: string[];
  breakdownKey?: string | null;
  chartType: PersonalReportChartType;
  fromDate?: string;
  toDate?: string;
  institutionProgramId?: string;
  mode?: PersonalReportMode;
  datasetKey?: keyof typeof personalReportDatasetDefinitions;
  rowDimensionKey?: string;
  columnDimensionKey?: string;
  timePreset?: PersonalReportTimePreset;
  dateGranularity?: PersonalReportDateGranularity;
  singleDimensionKey?: string;
  singleDisplay?: PersonalReportSingleDisplay;
  conditions?: PersonalReportFilterCondition[];
};

type StoredFilters = {
  fromDate?: string;
  toDate?: string;
  mode?: PersonalReportMode;
  datasetKey?: keyof typeof personalReportDatasetDefinitions;
  rowDimensionKey?: string;
  columnDimensionKey?: string;
  timePreset?: PersonalReportTimePreset;
  dateGranularity?: PersonalReportDateGranularity;
  singleDimensionKey?: string;
  singleDisplay?: PersonalReportSingleDisplay;
  conditions?: PersonalReportFilterCondition[];
};
type NumericRecord = Record<string, unknown>;

const reportSelect = {
  id: true,
  owner_id: true,
  institution_program_id: true,
  name: true,
  module: true,
  metric_keys: true,
  breakdown_key: true,
  chart_type: true,
  filters: true,
  is_shared: true,
  created_at: true,
  updated_at: true,
  users: { select: { full_name: true } },
} as const;

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asFilters(value: unknown): StoredFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return {
    ...(typeof input.fromDate === "string" ? { fromDate: input.fromDate } : {}),
    ...(typeof input.toDate === "string" ? { toDate: input.toDate } : {}),
    ...(["PIVOT", "SINGLE", "SUMMARY"].includes(String(input.mode)) ? { mode: input.mode as PersonalReportMode } : {}),
    ...(["LEADS", "ADMISSION_CANDIDATES", "STUDENTS"].includes(String(input.datasetKey)) ? { datasetKey: input.datasetKey as PersonalReportDatasetKey } : {}),
    ...(typeof input.rowDimensionKey === "string" ? { rowDimensionKey: input.rowDimensionKey } : {}),
    ...(typeof input.columnDimensionKey === "string" ? { columnDimensionKey: input.columnDimensionKey } : {}),
    ...(["LAST_7_DAYS", "THIS_WEEK", "LAST_WEEK", "THIS_MONTH", "LAST_MONTH", "THIS_QUARTER", "LAST_QUARTER", "CUSTOM"].includes(String(input.timePreset))
      ? { timePreset: input.timePreset as PersonalReportTimePreset }
      : {}),
    ...(["DAY", "WEEK", "MONTH", "QUARTER"].includes(String(input.dateGranularity))
      ? { dateGranularity: input.dateGranularity as PersonalReportDateGranularity }
      : {}),
    ...(typeof input.singleDimensionKey === "string" ? { singleDimensionKey: input.singleDimensionKey } : {}),
    ...(input.singleDisplay === "TABLE" || input.singleDisplay === "LINE" ? { singleDisplay: input.singleDisplay } : {}),
    ...(Array.isArray(input.conditions) ? { conditions: input.conditions.filter(isStoredFilterCondition).slice(0, 5) } : {}),
  };
}

function storedFiltersFromInput(input: PersonalReportInput): StoredFilters {
  return {
    fromDate: input.fromDate,
    toDate: input.toDate,
    mode: input.mode ?? "SUMMARY",
    datasetKey: input.datasetKey,
    rowDimensionKey: input.rowDimensionKey,
    columnDimensionKey: input.columnDimensionKey,
    timePreset: input.timePreset,
    dateGranularity: input.dateGranularity,
    singleDimensionKey: input.singleDimensionKey,
    singleDisplay: input.singleDisplay,
    conditions: input.conditions,
  };
}

function serializeReport(report: Awaited<ReturnType<typeof findVisibleReport>>) {
  if (!report) return null;
  return {
    id: report.id,
    ownerId: report.owner_id,
    ownerName: report.users.full_name,
    institutionProgramId: report.institution_program_id,
    name: report.name,
    module: report.module,
    metricKeys: asStringArray(report.metric_keys),
    breakdownKey: report.breakdown_key,
    chartType: report.chart_type,
    filters: asFilters(report.filters),
    isShared: report.is_shared,
    createdAt: report.created_at.toISOString(),
    updatedAt: report.updated_at.toISOString(),
  };
}

export function validatePersonalReportInput(user: AuthUser, input: PersonalReportInput) {
  if (!canUseReportModule(user, input.module)) return { ok: false as const, reason: "module_forbidden" as const };
  const dataset = input.datasetKey ? personalReportDatasetDefinitions[input.datasetKey] : undefined;
  if ((input.mode === "SINGLE" || input.mode === "PIVOT") && (!dataset || dataset.module !== input.module)) return { ok: false as const, reason: "invalid_dataset" as const };
  if (dataset && !validateConditions(dataset, input.conditions ?? [])) return { ok: false as const, reason: "invalid_filters" as const };
  if (input.timePreset === "CUSTOM" && (!input.fromDate || !input.toDate || !isRangeAllowed(input.fromDate, input.toDate, input.dateGranularity ?? "DAY"))) return { ok: false as const, reason: "invalid_time_preset" as const };
  if (input.mode === "SINGLE") {
    if (!dataset!.singleDimensions.some((dimension) => dimension.key === input.singleDimensionKey)) return { ok: false as const, reason: "invalid_single_dimension" as const };
    if (input.singleDisplay !== "TABLE" && input.singleDisplay !== "LINE") return { ok: false as const, reason: "invalid_single_display" as const };
    const output = dataset!.singleDimensions.find((dimension) => dimension.key === input.singleDimensionKey);
    if (output?.type === "DATE" && !dataset!.dateGranularities.some((item) => item.key === input.dateGranularity)) return { ok: false as const, reason: "invalid_date_granularity" as const };
  }
  if (input.mode === "PIVOT") {
    if (!dataset!.rowDimensions.some((dimension) => dimension.key === input.rowDimensionKey)) return { ok: false as const, reason: "invalid_row_dimension" as const };
    if (!dataset!.columnDimensions.some((dimension) => dimension.key === input.columnDimensionKey) || input.rowDimensionKey === input.columnDimensionKey) return { ok: false as const, reason: "invalid_column_dimension" as const };
    const hasDateOutput = [input.rowDimensionKey, input.columnDimensionKey].some((key) => dataset!.fields.some((field) => field.key === key && field.type === "DATE"));
    if (hasDateOutput && !dataset!.dateGranularities.some((item) => item.key === input.dateGranularity)) return { ok: false as const, reason: "invalid_date_granularity" as const };
  }
  const definition = personalReportDefinitions[input.module];
  const allowedMetrics = new Set(definition.metrics.map((metric) => metric.key));
  const allowedBreakdowns = new Set(definition.breakdowns.map((breakdown) => breakdown.key));
  if (input.metricKeys.length === 0 || input.metricKeys.length > 6 || input.metricKeys.some((key) => !allowedMetrics.has(key))) {
    return { ok: false as const, reason: "invalid_metrics" as const };
  }
  if (input.breakdownKey && !allowedBreakdowns.has(input.breakdownKey)) return { ok: false as const, reason: "invalid_breakdown" as const };
  if (input.institutionProgramId && !user.institutionProgramIds.includes(input.institutionProgramId)) {
    return { ok: false as const, reason: "program_forbidden" as const };
  }
  return { ok: true as const };
}

export async function listPersonalReports(user: AuthUser, page: number, limit: number) {
  const moduleKeys = (Object.keys(personalReportDefinitions) as PersonalReportModule[]).filter((module) => canUseReportModule(user, module));
  const where = {
    archived_at: null,
    module: { in: moduleKeys },
    OR: [{ owner_id: user.id }, { is_shared: true }],
    AND: [{ OR: [{ institution_program_id: null }, { institution_program_id: { in: user.institutionProgramIds } }] }],
  };
  const [items, total] = await prisma.$transaction([
    prisma.personal_reports.findMany({ where, select: reportSelect, orderBy: [{ updated_at: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.personal_reports.count({ where }),
  ]);
  return { items: items.map((item) => serializeReport(item)!), page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function createPersonalReport(user: AuthUser, input: PersonalReportInput, ipAddress?: string) {
  const report = await prisma.$transaction(async (transaction) => {
    const created = await transaction.personal_reports.create({
      data: {
        owner_id: user.id,
        institution_program_id: input.institutionProgramId,
        name: input.name,
        module: input.module,
        metric_keys: input.metricKeys,
        breakdown_key: input.breakdownKey,
        chart_type: input.chartType,
        filters: storedFiltersFromInput(input),
      },
      select: reportSelect,
    });
    await transaction.audit_logs.create({ data: { user_id: user.id, entity_type: "personal_report", entity_id: created.id, action: "create", ip_address: ipAddress, new_data: auditConfiguration(input) } });
    return created;
  });
  return serializeReport(report);
}

export async function updatePersonalReport(user: AuthUser, id: string, input: PersonalReportInput, ipAddress?: string) {
  const existing = await prisma.personal_reports.findFirst({ where: { id, owner_id: user.id, archived_at: null }, select: reportSelect });
  if (!existing) return null;
  const report = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.personal_reports.update({
      where: { id },
      data: { institution_program_id: input.institutionProgramId, name: input.name, module: input.module, metric_keys: input.metricKeys, breakdown_key: input.breakdownKey, chart_type: input.chartType, filters: storedFiltersFromInput(input), updated_at: new Date() },
      select: reportSelect,
    });
    await transaction.audit_logs.create({ data: { user_id: user.id, entity_type: "personal_report", entity_id: id, action: "update", ip_address: ipAddress, old_data: { name: existing.name, module: existing.module }, new_data: auditConfiguration(input) } });
    return updated;
  });
  return serializeReport(report);
}

export async function setPersonalReportSharing(user: AuthUser, id: string, isShared: boolean, ipAddress?: string) {
  const existing = await prisma.personal_reports.findFirst({ where: { id, owner_id: user.id, archived_at: null }, select: reportSelect });
  if (!existing) return null;
  const updated = await prisma.$transaction(async (transaction) => {
    const report = await transaction.personal_reports.update({ where: { id }, data: { is_shared: isShared, updated_at: new Date() }, select: reportSelect });
    await transaction.audit_logs.create({ data: { user_id: user.id, entity_type: "personal_report", entity_id: id, action: isShared ? "share" : "unshare", ip_address: ipAddress, new_data: { isShared } } });
    return report;
  });
  return serializeReport(updated);
}

export async function archivePersonalReport(user: AuthUser, id: string, ipAddress?: string) {
  const existing = await prisma.personal_reports.findFirst({ where: { id, owner_id: user.id, archived_at: null }, select: { id: true, name: true } });
  if (!existing) return false;
  await prisma.$transaction([
    prisma.personal_reports.update({ where: { id }, data: { archived_at: new Date(), is_shared: false, updated_at: new Date() } }),
    prisma.audit_logs.create({ data: { user_id: user.id, entity_type: "personal_report", entity_id: id, action: "archive", ip_address: ipAddress, old_data: { name: existing.name } } }),
  ]);
  return true;
}

async function findVisibleReport(user: AuthUser, id: string) {
  const report = await prisma.personal_reports.findFirst({
    where: { id, archived_at: null, OR: [{ owner_id: user.id }, { is_shared: true }] },
    select: reportSelect,
  });
  if (!report || !canUseReportModule(user, report.module as PersonalReportModule)) return null;
  if (report.institution_program_id && !user.institutionProgramIds.includes(report.institution_program_id)) return null;
  return report;
}

export async function executePersonalReport(user: AuthUser, id: string) {
  const stored = await findVisibleReport(user, id);
  if (!stored) return null;
  const module = stored.module as PersonalReportModule;
  const definition = personalReportDefinitions[module];
  const allowedMetricKeys = new Set(definition.metrics.map((metric) => metric.key));
  const metricKeys = asStringArray(stored.metric_keys).filter((key) => allowedMetricKeys.has(key));
  const filters = asFilters(stored.filters);
  if (filters.mode === "SINGLE") return executeDatasetSingleReport(user, stored, filters);
  if (filters.mode === "PIVOT") return executeDatasetPivotReport(user, stored, filters);
  const institutionProgramId = stored.institution_program_id ?? user.institutionProgramIds[0];
  if (!institutionProgramId) return null;
  const query = { ...filters, institutionProgramId };
  const raw = module === "MARKETING" ? await getMarketingDetailReport(user, query)
    : module === "SALE" ? await getSaleDetailReport(user, query)
      : module === "ADMISSION" ? await getAdmissionDetailReport(user, query)
        : await getStudentDetailReport(user, query);
  const rawRecord = raw as unknown as Record<string, unknown>;
  const summaryRecord = rawRecord.summary as NumericRecord;
  const summary = metricKeys.map((key) => {
    const metric = definition.metrics.find((item) => item.key === key)!;
    return { key, label: metric.label, format: metric.format, value: Number(summaryRecord[key] ?? 0) };
  });
  const rows = normalizeBreakdown(rawRecord[stored.breakdown_key ?? ""], metricKeys);
  return { report: serializeReport(stored), summary, rows, single: null, pivot: null };
}

function normalizeBreakdown(value: unknown, metricKeys: string[]) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item) => {
    const row = item as Record<string, unknown>;
    const selectedValue = metricKeys.map((key) => row[key]).find((candidate) => typeof candidate === "number");
    return { label: String(row.name ?? "Chưa xác định"), value: Number(selectedValue ?? row.total ?? row.leadCount ?? 0), percentage: undefined };
  });
}

function auditConfiguration(input: PersonalReportInput) {
  return {
    name: input.name,
    module: input.module,
    mode: input.mode ?? "SUMMARY",
    metricKeys: input.metricKeys,
    breakdownKey: input.breakdownKey,
    chartType: input.chartType,
    datasetKey: input.datasetKey,
    rowDimensionKey: input.rowDimensionKey,
    columnDimensionKey: input.columnDimensionKey,
    singleDimensionKey: input.singleDimensionKey,
    singleDisplay: input.singleDisplay,
    timePreset: input.timePreset,
    dateGranularity: input.dateGranularity,
    conditions: input.conditions,
  };
}

type DimensionOrder = Date | string | number | null;
type PivotQueryRow = {
  row_label: string;
  row_order: DimensionOrder;
  column_key: Date | string;
  column_order: DimensionOrder;
  total: bigint | number;
};
type SingleQueryRow = { label: Date | string; sort_order?: DimensionOrder; total: bigint | number };

type DatasetDefinition = typeof personalReportDatasetDefinitions[PersonalReportDatasetKey];

function isStoredFilterCondition(value: unknown): value is PersonalReportFilterCondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.fieldKey === "string"
    && ["EQUALS", "NOT_EQUALS", "DATE_PRESET", "DATE_BETWEEN"].includes(String(item.operator))
    && (item.value === undefined || typeof item.value === "string")
    && (item.fromDate === undefined || typeof item.fromDate === "string")
    && (item.toDate === undefined || typeof item.toDate === "string");
}

export function validateConditions(dataset: DatasetDefinition, conditions: PersonalReportFilterCondition[]) {
  if (conditions.length > 5) return false;
  return conditions.every((condition) => {
    const field = dataset.filterFields.find((item) => item.key === condition.fieldKey);
    if (!field) return false;
    if (field.type === "CATEGORY") return ["EQUALS", "NOT_EQUALS"].includes(condition.operator) && Boolean(condition.value?.trim());
    if (condition.operator === "DATE_PRESET") return ["LAST_7_DAYS", "THIS_WEEK", "LAST_WEEK", "THIS_MONTH", "LAST_MONTH", "THIS_QUARTER", "LAST_QUARTER"].includes(condition.value ?? "");
    return condition.operator === "DATE_BETWEEN" && Boolean(condition.fromDate && condition.toDate)
      && condition.toDate! >= condition.fromDate! && isRangeAllowed(condition.fromDate!, condition.toDate!, "DAY");
  });
}

export function datasetFrom(datasetKey: PersonalReportDatasetKey) {
  if (datasetKey === "ADMISSION_CANDIDATES") return Prisma.sql`reporting.admission_candidate_scope_fact fact`;
  if (datasetKey === "STUDENTS") return Prisma.sql`reporting.student_scope_fact fact`;
  return Prisma.sql`reporting.sale_pipeline_scope_fact fact`;
}

export function recordIdExpression(datasetKey: PersonalReportDatasetKey) {
  if (datasetKey === "ADMISSION_CANDIDATES") return Prisma.sql`fact.application_id`;
  if (datasetKey === "STUDENTS") return Prisma.sql`fact.student_id`;
  return Prisma.sql`fact.lead_id`;
}

export function rawFieldExpression(datasetKey: PersonalReportDatasetKey, fieldKey: string) {
  if (datasetKey === "LEADS") {
    if (fieldKey === "SOURCE") return Prisma.sql`fact.source_name`;
    if (fieldKey === "ASSIGNEE") return Prisma.sql`fact.assignee_name`;
    if (fieldKey === "PIPELINE_STAGE") return Prisma.sql`fact.pipeline_stage_name`;
    if (fieldKey === "STATUS") return Prisma.sql`fact.lead_status`;
    if (fieldKey === "CREATED_DATE") return Prisma.sql`fact.lead_date`;
  }
  if (datasetKey === "ADMISSION_CANDIDATES") {
    if (fieldKey === "ADMISSION_STATUS") return Prisma.sql`fact.admission_status_name`;
    if (fieldKey === "MAJOR") return Prisma.sql`fact.major_name`;
    if (fieldKey === "FEE_STATUS") return Prisma.sql`fact.fee_status`;
    if (fieldKey === "TUITION_STATUS") return Prisma.sql`fact.tuition_status`;
    if (fieldKey === "RECEIVED_DATE") return Prisma.sql`fact.received_date`;
  }
  if (datasetKey === "STUDENTS") {
    if (fieldKey === "STATUS") return Prisma.sql`fact.student_status`;
    if (fieldKey === "FACULTY") return Prisma.sql`fact.faculty_name`;
    if (fieldKey === "MAJOR") return Prisma.sql`fact.major_name`;
    if (fieldKey === "CLASS") return Prisma.sql`fact.class_name`;
    if (fieldKey === "ENROLLED_DATE") return Prisma.sql`fact.enrolled_date`;
  }
  throw new Error("Trường báo cáo không nằm trong danh mục cho phép.");
}

function outputExpression(datasetKey: PersonalReportDatasetKey, fieldKey: string, granularity: PersonalReportDateGranularity) {
  const field = personalReportDatasetDefinitions[datasetKey].fields.find((item) => item.key === fieldKey);
  const raw = rawFieldExpression(datasetKey, fieldKey);
  if (field?.type !== "DATE") return raw;
  if (granularity === "QUARTER") return Prisma.sql`date_trunc('quarter', ${raw})::date`;
  if (granularity === "MONTH") return Prisma.sql`date_trunc('month', ${raw})::date`;
  if (granularity === "WEEK") return Prisma.sql`date_trunc('week', ${raw})::date`;
  return raw;
}

function outputOrderExpression(datasetKey: PersonalReportDatasetKey, fieldKey: string, granularity: PersonalReportDateGranularity) {
  if (datasetKey === "LEADS" && fieldKey === "PIPELINE_STAGE") return Prisma.sql`fact.pipeline_stage_position`;
  return outputExpression(datasetKey, fieldKey, granularity);
}

export function conditionSql(datasetKey: PersonalReportDatasetKey, condition: PersonalReportFilterCondition) {
  const expression = rawFieldExpression(datasetKey, condition.fieldKey);
  if (condition.operator === "EQUALS") return Prisma.sql`${expression} = ${condition.value}`;
  if (condition.operator === "NOT_EQUALS") return Prisma.sql`${expression} <> ${condition.value}`;
  const range = condition.operator === "DATE_PRESET"
    ? resolvePersonalReportDateRange({ timePreset: condition.value as PersonalReportTimePreset })
    : { fromDate: condition.fromDate!, toDate: condition.toDate! };
  return Prisma.sql`${expression} BETWEEN ${range!.fromDate}::date AND ${range!.toDate}::date`;
}

function reportWhere(datasetKey: PersonalReportDatasetKey, filters: StoredFilters, scopeKeys: string[], institutionProgramId: string) {
  const conditions = (filters.conditions ?? []).map((condition) => conditionSql(datasetKey, condition));
  if (conditions.length === 0 && filters.timePreset) {
    const range = resolvePersonalReportDateRange(filters);
    if (range) conditions.push(Prisma.sql`${rawFieldExpression(datasetKey, personalReportDatasetDefinitions[datasetKey].primaryDateField)} BETWEEN ${range.fromDate}::date AND ${range.toDate}::date`);
  }
  return Prisma.sql`fact.scope_key IN (${Prisma.join(scopeKeys)})
    AND fact.institution_program_id = ${institutionProgramId}::uuid
    ${conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, " AND ")}` : Prisma.empty}`;
}

export async function getPersonalReportFilterValues(user: AuthUser, datasetKey: PersonalReportDatasetKey, fieldKey: string, institutionProgramId: string) {
  const dataset = personalReportDatasetDefinitions[datasetKey];
  const field = dataset?.filterFields.find((item) => item.key === fieldKey);
  if (!dataset || dataset.module && !canUseReportModule(user, dataset.module) || !field || field.type !== "CATEGORY") return null;
  if (!user.institutionProgramIds.includes(institutionProgramId)) return null;
  const scopeKeys = resolveMetabaseScopeKeys(user);
  if (scopeKeys.length === 0) return [];
  const expression = rawFieldExpression(datasetKey, fieldKey);
  const orderBy = datasetKey === "LEADS" && fieldKey === "PIPELINE_STAGE"
    ? Prisma.sql`MIN(fact.pipeline_stage_position) ASC NULLS LAST, value ASC`
    : Prisma.sql`total DESC, value ASC`;
  const rows = await prisma.$queryRaw<Array<{ value: string; total: bigint | number }>>(Prisma.sql`
    SELECT ${expression}::text AS value, COUNT(DISTINCT ${recordIdExpression(datasetKey)})::bigint AS total
    FROM ${datasetFrom(datasetKey)}
    WHERE fact.scope_key IN (${Prisma.join(scopeKeys)}) AND fact.institution_program_id = ${institutionProgramId}::uuid
    GROUP BY ${expression} ORDER BY ${orderBy} LIMIT 100
  `);
  return rows.map((item) => ({ value: item.value, label: normalizeDimensionLabel(item.value), count: Number(item.total) }));
}

async function executeDatasetSingleReport(user: AuthUser, stored: NonNullable<Awaited<ReturnType<typeof findVisibleReport>>>, filters: StoredFilters) {
  const datasetKey = filters.datasetKey;
  if (!datasetKey) return null;
  const dataset = personalReportDatasetDefinitions[datasetKey];
  if (dataset.module !== stored.module || !canUseReportModule(user, dataset.module)) return null;
  const dimension = dataset.singleDimensions.find((item) => item.key === filters.singleDimensionKey);
  if (!dimension || !validateConditions(dataset, filters.conditions ?? []) || !filters.singleDisplay) return null;
  const scopeKeys = resolveMetabaseScopeKeys(user);
  const institutionProgramId = stored.institution_program_id ?? user.institutionProgramIds[0];
  if (!institutionProgramId || scopeKeys.length === 0) return null;
  const granularity = filters.dateGranularity ?? "DAY";
  const expression = outputExpression(datasetKey, dimension.key, granularity);
  const orderExpression = outputOrderExpression(datasetKey, dimension.key, granularity);
  const rows = await prisma.$queryRaw<SingleQueryRow[]>(Prisma.sql`
    SELECT ${expression} AS label, ${orderExpression} AS sort_order,
      COUNT(DISTINCT ${recordIdExpression(datasetKey)})::bigint AS total
    FROM ${datasetFrom(datasetKey)}
    WHERE ${reportWhere(datasetKey, filters, scopeKeys, institutionProgramId)}
    GROUP BY ${expression}, ${orderExpression}
    ORDER BY ${orderExpression} ASC NULLS LAST, ${expression} ASC LIMIT 100
  `);
  const values = rows.map((item) => ({ label: dimension.type === "DATE" ? formatColumnLabel(toIsoDate(item.label), granularity) : normalizeDimensionLabel(String(item.label || "Chưa xác định")), value: Number(item.total) }));
  const total = values.reduce((sum, item) => sum + item.value, 0);
  return {
    report: serializeReport(stored),
    summary: [{ key: dataset.countMetricKey, label: dataset.measure.label, format: "NUMBER" as const, value: total }],
    rows: values.map((item) => ({ ...item, percentage: total ? Number((item.value / total * 100).toFixed(1)) : 0 })),
    single: { datasetLabel: dataset.label, dimensionLabel: dimension.label, display: filters.singleDisplay, range: displayRange(filters) },
    pivot: null,
  };
}

async function executeDatasetPivotReport(user: AuthUser, stored: NonNullable<Awaited<ReturnType<typeof findVisibleReport>>>, filters: StoredFilters) {
  const datasetKey = filters.datasetKey;
  if (!datasetKey || filters.rowDimensionKey === filters.columnDimensionKey) return null;
  const dataset = personalReportDatasetDefinitions[datasetKey];
  if (dataset.module !== stored.module || !canUseReportModule(user, dataset.module)) return null;
  const rowField = dataset.fields.find((item) => item.key === filters.rowDimensionKey);
  const columnField = dataset.fields.find((item) => item.key === filters.columnDimensionKey);
  if (!rowField || !columnField || !validateConditions(dataset, filters.conditions ?? [])) return null;
  const scopeKeys = resolveMetabaseScopeKeys(user);
  const institutionProgramId = stored.institution_program_id ?? user.institutionProgramIds[0];
  if (!institutionProgramId || scopeKeys.length === 0) return null;
  const granularity = filters.dateGranularity ?? "DAY";
  const rowExpression = outputExpression(datasetKey, rowField.key, granularity);
  const columnExpression = outputExpression(datasetKey, columnField.key, granularity);
  const rowOrderExpression = outputOrderExpression(datasetKey, rowField.key, granularity);
  const columnOrderExpression = outputOrderExpression(datasetKey, columnField.key, granularity);
  const rawRows = await prisma.$queryRaw<PivotQueryRow[]>(Prisma.sql`
    SELECT ${rowExpression}::text AS row_label, ${rowOrderExpression} AS row_order,
      ${columnExpression} AS column_key, ${columnOrderExpression} AS column_order,
      COUNT(DISTINCT ${recordIdExpression(datasetKey)})::bigint AS total
    FROM ${datasetFrom(datasetKey)}
    WHERE ${reportWhere(datasetKey, filters, scopeKeys, institutionProgramId)}
    GROUP BY ${rowExpression}, ${rowOrderExpression}, ${columnExpression}, ${columnOrderExpression}
    ORDER BY ${columnOrderExpression} ASC NULLS LAST, ${columnExpression} ASC,
      ${rowOrderExpression} ASC NULLS LAST, ${rowExpression} ASC LIMIT 5000
  `);
  const isDateColumn = columnField.type === "DATE";
  const columnKey = (value: Date | string) => isDateColumn ? toIsoDate(value) : String(value || "Chưa xác định");
  const columnKeys = [...new Set(rawRows.map((row) => columnKey(row.column_key)))].slice(0, 50);
  const columns = columnKeys.map((key) => ({ key, label: isDateColumn ? formatColumnLabel(key, granularity) : normalizeDimensionLabel(key) }));
  const valuesByRow = new Map<string, Record<string, number>>();
  const orderByRow = new Map<string, DimensionOrder>();
  for (const item of rawRows) {
    const rowLabel = rowField.type === "DATE" ? formatColumnLabel(toIsoDate(item.row_label), granularity) : normalizeDimensionLabel(item.row_label || "Chưa xác định");
    const key = columnKey(item.column_key);
    if (!columnKeys.includes(key)) continue;
    const values = valuesByRow.get(rowLabel) ?? {}; values[key] = Number(item.total); valuesByRow.set(rowLabel, values);
    if (!orderByRow.has(rowLabel)) orderByRow.set(rowLabel, item.row_order);
  }
  const resultRows = [...valuesByRow.entries()]
    .map(([label, values]) => ({ key: label, label, values, total: columnKeys.reduce((sum, key) => sum + (values[key] ?? 0), 0) }))
    .sort((left, right) => rowField.key === "PIPELINE_STAGE"
      ? compareDimensionOrder(orderByRow.get(left.label), orderByRow.get(right.label), left.label, right.label)
      : right.total - left.total || left.label.localeCompare(right.label, "vi"));
  const columnTotals = Object.fromEntries(columnKeys.map((key) => [key, resultRows.reduce((sum, row) => sum + (row.values[key] ?? 0), 0)]));
  const grandTotal = resultRows.reduce((sum, row) => sum + row.total, 0);
  return {
    report: serializeReport(stored), summary: [{ key: dataset.countMetricKey, label: dataset.measure.label, format: "NUMBER" as const, value: grandTotal }], rows: [],
    pivot: { datasetLabel: dataset.label, rowLabel: rowField.label, columnLabel: columnField.label, granularity, range: displayRange(filters), columns, rows: resultRows, columnTotals, grandTotal },
    single: null,
  };
}

function compareDimensionOrder(left: DimensionOrder | undefined, right: DimensionOrder | undefined, leftLabel: string, rightLabel: string) {
  if (left == null && right != null) return 1;
  if (left != null && right == null) return -1;
  if (typeof left === "number" && typeof right === "number" && left !== right) return left - right;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (left != null && right != null && String(left) !== String(right)) return String(left).localeCompare(String(right), "vi");
  return leftLabel.localeCompare(rightLabel, "vi");
}

function displayRange(filters: StoredFilters) {
  const dateCondition = filters.conditions?.find((item) => item.operator === "DATE_PRESET" || item.operator === "DATE_BETWEEN");
  if (dateCondition?.operator === "DATE_PRESET") return resolvePersonalReportDateRange({ timePreset: dateCondition.value as PersonalReportTimePreset });
  if (dateCondition?.operator === "DATE_BETWEEN") return { fromDate: dateCondition.fromDate!, toDate: dateCondition.toDate! };
  return filters.timePreset ? resolvePersonalReportDateRange(filters) : null;
}

async function executeLeadSingleReport(user: AuthUser, stored: NonNullable<Awaited<ReturnType<typeof findVisibleReport>>>, filters: StoredFilters) {
  if (filters.datasetKey !== "LEADS") return null;
  const dataset = personalReportDatasetDefinitions.LEADS;
  const dimension = dataset.singleDimensions.find((item) => item.key === filters.singleDimensionKey);
  if (!dimension || (filters.singleDisplay !== "TABLE" && filters.singleDisplay !== "LINE")) return null;
  const range = resolvePersonalReportDateRange(filters);
  const scopeKeys = resolveMetabaseScopeKeys(user);
  const institutionProgramId = stored.institution_program_id ?? user.institutionProgramIds[0];
  if (!range || scopeKeys.length === 0 || !institutionProgramId) return null;

  const granularity = filters.dateGranularity ?? "DAY";
  const dimensionExpression = filters.singleDimensionKey === "CREATED_DATE"
    ? dateDimensionExpression(granularity)
    : filters.singleDimensionKey === "SOURCE"
      ? Prisma.sql`fact.source_name`
      : filters.singleDimensionKey === "PIPELINE_STAGE"
        ? Prisma.sql`fact.pipeline_stage_name`
        : Prisma.sql`fact.lead_status`;
  const rawRows = await prisma.$queryRaw<SingleQueryRow[]>(Prisma.sql`
    SELECT ${dimensionExpression} AS label,
           COUNT(DISTINCT fact.lead_id)::bigint AS total
    FROM reporting.sale_pipeline_scope_fact fact
    WHERE fact.scope_key IN (${Prisma.join(scopeKeys)})
      AND fact.institution_program_id = ${institutionProgramId}::uuid
      AND fact.lead_date BETWEEN ${range.fromDate}::date AND ${range.toDate}::date
    GROUP BY ${dimensionExpression}
    ORDER BY ${dimensionExpression} ASC
    LIMIT 100
  `);
  const values = rawRows.map((item) => ({
    label: dimension.type === "DATE"
      ? formatColumnLabel(toIsoDate(item.label), granularity)
      : normalizeDimensionLabel(String(item.label || "Chưa xác định")),
    value: Number(item.total),
  }));
  const total = values.reduce((sum, item) => sum + item.value, 0);
  const rows = values.map((item) => ({ ...item, percentage: total > 0 ? Number(((item.value / total) * 100).toFixed(1)) : 0 }));
  return {
    report: serializeReport(stored),
    summary: [{ key: "leadCount", label: "Số lượng khách hàng", format: "NUMBER" as const, value: total }],
    rows,
    single: {
      datasetLabel: dataset.label,
      dimensionLabel: dimension.label,
      display: filters.singleDisplay,
      range,
    },
    pivot: null,
  };
}

async function executeLeadPivotReport(user: AuthUser, stored: NonNullable<Awaited<ReturnType<typeof findVisibleReport>>>, filters: StoredFilters) {
  if (filters.datasetKey !== "LEADS" || filters.columnDimensionKey !== "CREATED_DATE") return null;
  const dataset = personalReportDatasetDefinitions.LEADS;
  const rowDimension = dataset.rowDimensions.find((item) => item.key === filters.rowDimensionKey);
  const granularity = filters.dateGranularity ?? "DAY";
  if (!rowDimension || !dataset.dateGranularities.some((item) => item.key === granularity)) return null;

  const range = resolvePersonalReportDateRange(filters);
  if (!range) return null;
  const scopeKeys = resolveMetabaseScopeKeys(user);
  if (scopeKeys.length === 0) return null;
  const institutionProgramId = stored.institution_program_id ?? user.institutionProgramIds[0];
  if (!institutionProgramId) return null;

  const rowExpression = filters.rowDimensionKey === "SOURCE"
    ? Prisma.sql`fact.source_name`
    : filters.rowDimensionKey === "PIPELINE_STAGE"
      ? Prisma.sql`fact.pipeline_stage_name`
      : Prisma.sql`fact.lead_status`;
  const columnExpression = dateDimensionExpression(granularity);
  const rawRows = await prisma.$queryRaw<PivotQueryRow[]>(Prisma.sql`
    SELECT ${rowExpression} AS row_label,
           ${columnExpression} AS column_key,
           COUNT(DISTINCT fact.lead_id)::bigint AS total
    FROM reporting.sale_pipeline_scope_fact fact
    WHERE fact.scope_key IN (${Prisma.join(scopeKeys)})
      AND fact.institution_program_id = ${institutionProgramId}::uuid
      AND fact.lead_date BETWEEN ${range.fromDate}::date AND ${range.toDate}::date
    GROUP BY ${rowExpression}, ${columnExpression}
    ORDER BY ${columnExpression} ASC, ${rowExpression} ASC
  `);

  const columnKeys = [...new Set(rawRows.map((row) => toIsoDate(row.column_key)))].sort();
  const columns = columnKeys.map((key) => ({ key, label: formatColumnLabel(key, granularity) }));
  const valuesByRow = new Map<string, Record<string, number>>();
  for (const item of rawRows) {
    const rowLabel = item.row_label || "Chưa xác định";
    const columnKey = toIsoDate(item.column_key);
    const values = valuesByRow.get(rowLabel) ?? {};
    values[columnKey] = Number(item.total);
    valuesByRow.set(rowLabel, values);
  }
  const rows = [...valuesByRow.entries()].map(([label, values]) => ({
    key: label,
    label,
    values,
    total: columnKeys.reduce((sum, key) => sum + (values[key] ?? 0), 0),
  })).sort((left, right) => right.total - left.total || left.label.localeCompare(right.label, "vi"));
  const columnTotals = Object.fromEntries(columnKeys.map((key) => [key, rows.reduce((sum, row) => sum + (row.values[key] ?? 0), 0)]));
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return {
    report: serializeReport(stored),
    summary: [{ key: "leadCount", label: "Số lượng khách hàng", format: "NUMBER" as const, value: grandTotal }],
    rows: [],
    pivot: {
      datasetLabel: dataset.label,
      rowLabel: rowDimension.label,
      columnLabel: "Ngày tạo",
      granularity,
      range,
      columns,
      rows,
      columnTotals,
      grandTotal,
    },
    single: null,
  };
}

function dateDimensionExpression(granularity: PersonalReportDateGranularity) {
  return granularity === "QUARTER"
    ? Prisma.sql`date_trunc('quarter', fact.lead_date)::date`
    : granularity === "MONTH"
    ? Prisma.sql`date_trunc('month', fact.lead_date)::date`
    : granularity === "WEEK"
      ? Prisma.sql`date_trunc('week', fact.lead_date)::date`
      : Prisma.sql`fact.lead_date`;
}

function normalizeDimensionLabel(value: string) {
  const labels: Record<string, string> = {
    new: "Mới",
    active: "Đang hoạt động",
    inactive: "Ngừng hoạt động",
    converted: "Đã chuyển đổi",
    lost: "Không thành công",
  };
  return labels[value.toLowerCase()] ?? value;
}

export function resolvePersonalReportDateRange(
  filters: Pick<StoredFilters, "timePreset" | "fromDate" | "toDate" | "dateGranularity">,
  currentDate = todayInVietnam(),
) {
  if (filters.timePreset === "CUSTOM") {
    if (!filters.fromDate || !filters.toDate) return null;
    return isRangeAllowed(filters.fromDate, filters.toDate, filters.dateGranularity ?? "DAY")
      ? { fromDate: filters.fromDate, toDate: filters.toDate }
      : null;
  }
  const today = parseIsoDate(currentDate);
  let from = today;
  let to = today;
  if (filters.timePreset === "LAST_7_DAYS") from = addUtcDays(today, -6);
  if (filters.timePreset === "THIS_WEEK" || filters.timePreset === "LAST_WEEK") {
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    from = addUtcDays(today, -mondayOffset + (filters.timePreset === "LAST_WEEK" ? -7 : 0));
    to = addUtcDays(from, 6);
  }
  if (filters.timePreset === "THIS_MONTH" || filters.timePreset === "LAST_MONTH") {
    const monthOffset = filters.timePreset === "LAST_MONTH" ? -1 : 0;
    from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
    to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
  }
  if (filters.timePreset === "THIS_QUARTER" || filters.timePreset === "LAST_QUARTER") {
    const currentQuarterStartMonth = Math.floor(today.getUTCMonth() / 3) * 3;
    const quarterOffset = filters.timePreset === "LAST_QUARTER" ? -3 : 0;
    from = new Date(Date.UTC(today.getUTCFullYear(), currentQuarterStartMonth + quarterOffset, 1));
    to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 3, 0));
  }
  return { fromDate: toIsoDate(from), toDate: toIsoDate(to) };
}

function isRangeAllowed(fromDate: string, toDate: string, granularity: PersonalReportDateGranularity) {
  const days = Math.floor((parseIsoDate(toDate).getTime() - parseIsoDate(fromDate).getTime()) / 86_400_000) + 1;
  const maximum = granularity === "DAY" ? 93 : granularity === "WEEK" ? 730 : 1826;
  return days > 0 && days <= maximum;
}

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(value: Date | string) {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

function formatColumnLabel(value: string, granularity: PersonalReportDateGranularity) {
  const date = parseIsoDate(value);
  if (granularity === "QUARTER") return `Quý ${Math.floor(date.getUTCMonth() / 3) + 1}/${date.getUTCFullYear()}`;
  if (granularity === "MONTH") return new Intl.DateTimeFormat("vi-VN", { month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
  if (granularity === "WEEK") return `Tuần từ ${new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date)}`;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}
