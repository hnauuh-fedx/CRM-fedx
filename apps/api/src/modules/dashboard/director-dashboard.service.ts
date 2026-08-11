import { prisma } from "../../database/prisma";

export async function getDirectorDashboard(institutionProgramId?: string) {
  const activeLeadWhere = {
    deleted_at: null,
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const admissionWhere = institutionProgramId ? { institution_program_id: institutionProgramId } : {};
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
  ] = await prisma.$transaction([
    prisma.leads.count({ where: activeLeadWhere }),
    prisma.admission_profiles.count({ where: admissionWhere }),
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
      where: activeLeadWhere,
      _count: { _all: true },
      orderBy: { _count: { pipeline_stage_id: "desc" } },
      take: 6,
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
  ]);

  const [stages, assignees, departments, admissionStatuses] = await prisma.$transaction([
    prisma.pipeline_stages.findMany({
      where: {
        id: { in: stageGroups.flatMap((group) => (group.pipeline_stage_id ? [group.pipeline_stage_id] : [])) },
      },
      select: { id: true, name: true },
    }),
    prisma.users.findMany({
      where: {
        id: { in: assigneeGroups.flatMap((group) => (group.assigned_to ? [group.assigned_to] : [])) },
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
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const assigneeNames = new Map(assignees.map((assignee) => [assignee.id, assignee.full_name]));
  const admissionStatusNames = new Map(
    admissionStatuses.map((status) => [status.id, status.name]),
  );

  return {
    summary: {
      totalLeads,
      totalApplications,
      enrolledStudents,
      leadToApplicationRate: totalLeads === 0 ? 0 : Number(((totalApplications / totalLeads) * 100).toFixed(1)),
      applicationToStudentRate: totalApplications === 0 ? 0 : Number(((enrolledStudents / totalApplications) * 100).toFixed(1)),
      conversionRate: totalLeads === 0 ? 0 : Number(((enrolledStudents / totalLeads) * 100).toFixed(1)),
      monthlyRevenue: Number(revenue._sum.monthly_revenue?.toString() ?? 0),
    },
    leadsBySource: sources
      .filter((source) => source._count.leads > 0)
      .map((source) => ({ id: source.id, name: source.name, total: source._count.leads })),
    leadsByStage: stageGroups.map((group) => ({
      id: group.pipeline_stage_id,
      name: group.pipeline_stage_id
        ? (stageNames.get(group.pipeline_stage_id) ?? "Chưa xác định")
        : "Chưa có giai đoạn",
      total: group._count._all,
    })),
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
