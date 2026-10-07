import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import { applicationStageLeadWhere } from "../leads/pipeline-stage-semantics";
import { ACTIVE_LEAD_STATUS } from "../leads/domain/lead-lifecycle-status";
import {
  resolvePersonalReportDateRange,
} from "../reports/personal-report.service";

export type DirectorDashboardFilters = {
  majorId?: string;
  sourceId?: string;
  assigneeId?: string;
  pipelineStageId?: string;
  filterOperator?: "EQUALS" | "NOT_EQUALS";
  timePreset?: "LAST_7_DAYS" | "THIS_WEEK" | "LAST_WEEK" | "THIS_MONTH" | "LAST_MONTH" | "THIS_QUARTER" | "LAST_QUARTER" | "CUSTOM";
  fromDate?: string;
  toDate?: string;
};

export async function getDirectorDashboard(
  institutionProgramId?: string,
  filters: DirectorDashboardFilters = {},
) {
  const activeLeadWhere: Prisma.leadsWhereInput = {
    deleted_at: null,
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const filteredLeadWhere = buildFilteredLeadWhere(activeLeadWhere, filters);
  const admissionWhere = {
    leads: { is: { ...activeLeadWhere, ...applicationStageLeadWhere() } },
  };
  const applicationLeadWhere = { ...activeLeadWhere, ...applicationStageLeadWhere() };
  const studentWhere = institutionProgramId ? { institution_program_id: institutionProgramId } : {};
  const [
    totalLeads,
    totalApplications,
    enrolledStudents,
    revenue,
    sources,
    stageGroups,
    departmentGroups,
    assigneeGroups,
    admissionStatusGroups,
    thresholdStages,
    majorOptions,
    sourceOptions,
    assigneeOptions,
  ] = await prisma.$transaction([
    prisma.leads.count({ where: activeLeadWhere }),
    prisma.leads.count({ where: applicationLeadWhere }),
    prisma.students.count({ where: studentWhere }),
    prisma.admission_profiles.aggregate({ where: admissionWhere, _sum: { monthly_revenue: true } }),
    prisma.lead_sources.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { leads: { where: activeLeadWhere } } },
      },
      orderBy: { leads: { _count: "desc" } },
      take: 5,
    }),
    prisma.leads.groupBy({
      by: ["pipeline_stage_id"],
      where: { AND: [activeLeadWhere, { status: ACTIVE_LEAD_STATUS }] },
      _count: { _all: true },
      orderBy: { _count: { pipeline_stage_id: "desc" } },
    }),
    prisma.lead_assignments.groupBy({
      by: ["department_id"],
      where: {
        is_main_owner: true,
        department_id: { not: null },
        leads: { is: activeLeadWhere },
      },
      _count: { _all: true },
      orderBy: { _count: { department_id: "desc" } },
      take: 5,
    }),
    prisma.leads.groupBy({
      by: ["assigned_to"],
      where: { ...activeLeadWhere, assigned_to: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { assigned_to: "desc" } },
      take: 5,
    }),
    prisma.admission_profiles.groupBy({
      by: ["admission_status_id"],
      where: admissionWhere,
      _count: { _all: true },
      orderBy: { _count: { admission_status_id: "desc" } },
      take: 6,
    }),
    prisma.pipeline_stages.findMany({
      where: {
        OR: ["(L2)", "(L4)", "(L5)"].map((marker) => ({
          name: { contains: marker, mode: "insensitive" as const },
        })),
      },
      select: { pipeline_id: true, name: true, position: true },
    }),
    prisma.majors.findMany({
      where: institutionProgramId ? { institution_program_id: institutionProgramId } : undefined,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.lead_sources.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.users.findMany({
      where: {
        deleted_at: null,
        leads_leads_assigned_toTousers: { some: activeLeadWhere },
      },
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
    }),
  ]);

  const qualifiedStageWhere = stageAtOrAfterWhere(thresholdStages, "(L2)");
  const registeredStageWhere = stageAtOrAfterWhere(thresholdStages, "(L4)");
  const studentStageWhere = stageAtOrAfterWhere(thresholdStages, "(L5)");
  const [totalData, qualifiedLeads, registeredLeads, totalStudents, matrixGroups, sourceBreakdownGroups] = await prisma.$transaction([
    prisma.leads.count({ where: filteredLeadWhere }),
    prisma.leads.count({ where: { AND: [filteredLeadWhere, qualifiedStageWhere] } }),
    prisma.leads.count({ where: { AND: [filteredLeadWhere, registeredStageWhere] } }),
    prisma.leads.count({ where: { AND: [filteredLeadWhere, studentStageWhere] } }),
    prisma.leads.groupBy({
      by: ["assigned_to", "pipeline_stage_id"],
      where: { AND: [filteredLeadWhere, { status: ACTIVE_LEAD_STATUS }] },
      _count: { _all: true },
    }),
    prisma.leads.groupBy({
      by: ["source_id"],
      where: filteredLeadWhere,
      _count: { _all: true },
    }),
  ]);

  const [stages, assignees, departments, admissionStatuses] = await prisma.$transaction([
    prisma.pipeline_stages.findMany({
      where: {
        id: { in: stageGroups.flatMap((group) => (group.pipeline_stage_id ? [group.pipeline_stage_id] : [])) },
      },
      select: { id: true, name: true, position: true },
    }),
    prisma.users.findMany({
      where: {
        id: {
          in: Array.from(new Set([
            ...assigneeGroups.flatMap((group) => (group.assigned_to ? [group.assigned_to] : [])),
            ...matrixGroups.flatMap((group) => (group.assigned_to ? [group.assigned_to] : [])),
          ])),
        },
      },
      select: { id: true, full_name: true },
    }),
    prisma.departments.findMany({
      where: {
        id: {
          in: departmentGroups.flatMap((group) =>
            group.department_id ? [group.department_id] : [],
          ),
        },
      },
      select: { id: true, name: true },
    }),
    prisma.admission_statuses.findMany({
      where: {
        id: {
          in: admissionStatusGroups.flatMap((group) =>
            group.admission_status_id ? [group.admission_status_id] : [],
          ),
        },
      },
      select: { id: true, name: true },
    }),
  ]);
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const assigneeNames = new Map(assignees.map((assignee) => [assignee.id, assignee.full_name]));
  const admissionStatusNames = new Map(
    admissionStatuses.map((status) => [status.id, status.name]),
  );
  const sourceNames = new Map(sourceOptions.map((source) => [source.id, source.name]));
  const leadPipelineMatrix = buildLeadPipelineMatrix(
    stageGroups,
    matrixGroups,
    stagesById,
    assigneeNames,
  );
  const stageOptions = [...stages]
    .sort((left, right) => comparePipelineStagePosition(left.position, right.position, left.name, right.name))
    .map((stage) => ({ id: stage.id, name: stage.name }));

  return {
    summary: {
      totalData,
      qualifiedLeads,
      registeredLeads,
      registeredConversionRate: percentage(registeredLeads, qualifiedLeads),
      totalStudents,
      studentConversionRate: percentage(totalStudents, qualifiedLeads),
      totalLeads,
      totalApplications,
      enrolledStudents,
      leadToApplicationRate: totalLeads === 0 ? 0 : Number(((totalApplications / totalLeads) * 100).toFixed(1)),
      applicationToStudentRate: totalApplications === 0 ? 0 : Number(((enrolledStudents / totalApplications) * 100).toFixed(1)),
      conversionRate: totalLeads === 0 ? 0 : Number(((enrolledStudents / totalLeads) * 100).toFixed(1)),
      monthlyRevenue: Number(revenue._sum.monthly_revenue?.toString() ?? 0),
    },
    filterOptions: {
      majors: majorOptions,
      sources: sourceOptions,
      assignees: assigneeOptions.map((user) => ({ id: user.id, name: user.full_name })),
      stages: stageOptions,
    },
    leadPipelineMatrix,
    leadSourceBreakdown: buildLeadSourceBreakdown(sourceBreakdownGroups, sourceNames, totalData),
    leadsBySource: sources
      .filter((source) => source._count.leads > 0)
      .map((source) => ({ id: source.id, name: source.name, total: source._count.leads })),
    leadsByStage: stageGroups
      .map((group) => ({
        id: group.pipeline_stage_id,
        name: group.pipeline_stage_id
          ? (stagesById.get(group.pipeline_stage_id)?.name ?? "Chưa xác định")
          : "Chưa có giai đoạn",
        position: group.pipeline_stage_id ? stagesById.get(group.pipeline_stage_id)?.position ?? null : null,
        total: group._count._all,
      }))
      .sort((left, right) => comparePipelineStagePosition(left.position, right.position, left.name, right.name))
      .map(({ position: _position, ...stage }) => stage),
    leadsByDepartment: departmentGroups.map((group) => ({
      id: group.department_id!,
      name: departmentNames.get(group.department_id!) ?? "Chưa xác định",
      total: group._count._all,
    })),
    staffKpi: assigneeGroups.map((group) => ({
      id: group.assigned_to!,
      fullName: assigneeNames.get(group.assigned_to!) ?? "Chưa xác định",
      assignedLeads: group._count._all,
    })),
    admissionFunnel: admissionStatusGroups.map((group) => ({
      id: group.admission_status_id,
      name: group.admission_status_id
        ? (admissionStatusNames.get(group.admission_status_id) ?? "Chưa xác định")
        : "Chưa có trạng thái",
      total: group._count._all,
    })),
  };
}

export async function getDirectorLeadPipelineMatrix(
  institutionProgramId?: string,
  filters: DirectorDashboardFilters = {},
) {
  const activeLeadWhere: Prisma.leadsWhereInput = {
    deleted_at: null,
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const filteredLeadWhere = buildFilteredLeadWhere(activeLeadWhere, filters);
  const [stageGroups, matrixGroups] = await prisma.$transaction([
    prisma.leads.groupBy({
      by: ["pipeline_stage_id"],
      where: { AND: [activeLeadWhere, { status: ACTIVE_LEAD_STATUS }] },
      _count: { _all: true },
    }),
    prisma.leads.groupBy({
      by: ["assigned_to", "pipeline_stage_id"],
      where: { AND: [filteredLeadWhere, { status: ACTIVE_LEAD_STATUS }] },
      _count: { _all: true },
    }),
  ]);
  const [stages, assignees] = await prisma.$transaction([
    prisma.pipeline_stages.findMany({
      where: {
        id: { in: stageGroups.flatMap((group) => (group.pipeline_stage_id ? [group.pipeline_stage_id] : [])) },
      },
      select: { id: true, name: true, position: true },
    }),
    prisma.users.findMany({
      where: {
        id: { in: matrixGroups.flatMap((group) => (group.assigned_to ? [group.assigned_to] : [])) },
      },
      select: { id: true, full_name: true },
    }),
  ]);

  return buildLeadPipelineMatrix(
    stageGroups,
    matrixGroups,
    new Map(stages.map((stage) => [stage.id, stage])),
    new Map(assignees.map((assignee) => [assignee.id, assignee.full_name])),
  );
}

export async function getDirectorLeadSourceBreakdown(
  institutionProgramId?: string,
  filters: DirectorDashboardFilters = {},
) {
  const activeLeadWhere: Prisma.leadsWhereInput = {
    deleted_at: null,
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const filteredLeadWhere = buildFilteredLeadWhere(activeLeadWhere, filters);
  const [sourceGroups, sources] = await prisma.$transaction([
    prisma.leads.groupBy({
      by: ["source_id"],
      where: filteredLeadWhere,
      _count: { _all: true },
    }),
    prisma.lead_sources.findMany({
      select: { id: true, name: true },
    }),
  ]);
  const total = sourceGroups.reduce((sum, group) => sum + group._count._all, 0);

  return buildLeadSourceBreakdown(
    sourceGroups,
    new Map(sources.map((source) => [source.id, source.name])),
    total,
  );
}

function buildLeadSourceBreakdown(
  groups: Array<{ source_id: string | null; _count: { _all: number } }>,
  sourceNames: Map<string, string>,
  total: number,
) {
  const rows = groups
    .map((group) => ({
      id: group.source_id,
      name: group.source_id ? (sourceNames.get(group.source_id) ?? "Chưa xác định") : "Chưa xác định",
      total: group._count._all,
      percentage: percentage(group._count._all, total),
    }))
    .sort((left, right) => {
      if (left.id === null) return -1;
      if (right.id === null) return 1;
      return left.name.localeCompare(right.name, "vi");
    });

  return { rows, total };
}

function buildLeadPipelineMatrix(
  stageGroups: Array<{ pipeline_stage_id: string | null; _count: { _all: number } }>,
  matrixGroups: Array<{ assigned_to: string | null; pipeline_stage_id: string | null; _count: { _all: number } }>,
  stagesById: Map<string, { id: string; name: string; position: number | null }>,
  assigneeNames: Map<string, string>,
) {
  const stageIds = Array.from(new Set(
    stageGroups.flatMap((group) => (group.pipeline_stage_id ? [group.pipeline_stage_id] : [])),
  ));
  const columns = [
    { key: "UNASSIGNED_STAGE", id: null, name: "Chưa chọn tiến trình", position: null as number | null },
    ...stageIds
      .map((id) => stagesById.get(id))
      .filter((stage): stage is { id: string; name: string; position: number | null } => Boolean(stage))
      .sort((left, right) => comparePipelineStagePosition(left.position, right.position, left.name, right.name))
      .map((stage) => ({ key: stage.id, id: stage.id, name: stage.name, position: stage.position })),
  ];
  const rowsByAssignee = new Map<string, {
    id: string | null;
    name: string;
    values: Record<string, number>;
    total: number;
  }>();
  const columnTotals = Object.fromEntries(columns.map((column) => [column.key, 0])) as Record<string, number>;

  for (const group of matrixGroups) {
    const assigneeKey = group.assigned_to ?? "UNASSIGNED_ASSIGNEE";
    const stageKey = group.pipeline_stage_id ?? "UNASSIGNED_STAGE";
    const row = rowsByAssignee.get(assigneeKey) ?? {
      id: group.assigned_to,
      name: group.assigned_to
        ? (assigneeNames.get(group.assigned_to) ?? "Không xác định")
        : "Chưa phân công",
      values: {},
      total: 0,
    };
    row.values[stageKey] = group._count._all;
    row.total += group._count._all;
    columnTotals[stageKey] = (columnTotals[stageKey] ?? 0) + group._count._all;
    rowsByAssignee.set(assigneeKey, row);
  }

  const rows = Array.from(rowsByAssignee.entries())
    .sort(([leftKey, left], [rightKey, right]) => {
      if (leftKey === "UNASSIGNED_ASSIGNEE") return -1;
      if (rightKey === "UNASSIGNED_ASSIGNEE") return 1;
      return left.name.localeCompare(right.name, "vi");
    })
    .map(([, row]) => row);

  return {
    columns: columns.map(({ position: _position, ...column }) => ({
      ...column,
      total: columnTotals[column.key] ?? 0,
    })),
    rows,
    total: rows.reduce((sum, row) => sum + row.total, 0),
  };
}

function buildFilteredLeadWhere(
  activeLeadWhere: Prisma.leadsWhereInput,
  filters: DirectorDashboardFilters,
): Prisma.leadsWhereInput {
  const dateRange = filters.timePreset
    ? resolvePersonalReportDateRange({
        timePreset: filters.timePreset,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
      })
    : null;

  return {
    AND: [
      activeLeadWhere,
      buildCategoryFilter(filters),
    ],
    ...(dateRange
      ? {
          created_at: {
            gte: new Date(`${dateRange.fromDate}T00:00:00.000Z`),
            lte: new Date(`${dateRange.toDate}T23:59:59.999Z`),
          },
        }
      : {}),
  };
}

function buildCategoryFilter(filters: DirectorDashboardFilters): Prisma.leadsWhereInput {
  const isNotEqual = filters.filterOperator === "NOT_EQUALS";
  if (filters.majorId) {
    return isNotEqual
      ? { OR: [{ major_id: { not: filters.majorId } }, { major_id: null }] }
      : { major_id: filters.majorId };
  }
  if (filters.sourceId) {
    return isNotEqual
      ? { OR: [{ source_id: { not: filters.sourceId } }, { source_id: null }] }
      : { source_id: filters.sourceId };
  }
  if (filters.assigneeId) {
    return isNotEqual
      ? { OR: [{ assigned_to: { not: filters.assigneeId } }, { assigned_to: null }] }
      : { assigned_to: filters.assigneeId };
  }
  if (filters.pipelineStageId) {
    return isNotEqual
      ? { OR: [{ pipeline_stage_id: { not: filters.pipelineStageId } }, { pipeline_stage_id: null }] }
      : { pipeline_stage_id: filters.pipelineStageId };
  }
  return {};
}

function stageAtOrAfterWhere(
  stages: Array<{ pipeline_id: string | null; name: string; position: number | null }>,
  marker: "(L2)" | "(L4)" | "(L5)",
): Prisma.leadsWhereInput {
  const thresholds = stages.filter(
    (stage) => stage.pipeline_id && stage.position != null && stage.name.toUpperCase().includes(marker),
  );
  if (thresholds.length === 0) return { id: { in: [] } };
  return {
    OR: thresholds.map((stage) => ({
      pipeline_stages: {
        is: {
          pipeline_id: stage.pipeline_id!,
          position: { gte: stage.position! },
        },
      },
    })),
  };
}

function percentage(value: number, base: number) {
  return base === 0 ? 0 : Number(((value / base) * 100).toFixed(1));
}

function comparePipelineStagePosition(left: number | null, right: number | null, leftName: string, rightName: string) {
  if (left == null && right != null) return 1;
  if (left != null && right == null) return -1;
  if (left != null && right != null && left !== right) return left - right;
  return leftName.localeCompare(rightName, "vi");
}
