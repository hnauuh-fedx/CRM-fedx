import { prisma } from "../../database/prisma";

export async function getOverviewReport(institutionProgramId?: string) {
  const leadWhere = {
    deleted_at: null,
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const admissionWhere = institutionProgramId ? { institution_program_id: institutionProgramId } : {};
  const studentWhere = institutionProgramId ? { institution_program_id: institutionProgramId } : {};
  const [
    totalLeads,
    totalApplications,
    totalStudents,
    revenue,
    applicationStatusGroups,
    facultyGroups,
    majorGroups,
  ] = await prisma.$transaction([
    prisma.leads.count({ where: leadWhere }),
    prisma.admission_profiles.count({ where: admissionWhere }),
    prisma.students.count({ where: studentWhere }),
    prisma.admission_profiles.aggregate({ where: admissionWhere, _sum: { monthly_revenue: true } }),
    prisma.admission_profiles.groupBy({
      by: ["admission_status_id"],
      where: admissionWhere,
      _count: { _all: true },
      orderBy: { _count: { admission_status_id: "desc" } },
      take: 10,
    }),
    prisma.students.groupBy({
      by: ["faculty_id"],
      where: { ...studentWhere, faculty_id: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { faculty_id: "desc" } },
      take: 10,
    }),
    prisma.admission_profiles.groupBy({
      by: ["major_id"],
      where: { ...admissionWhere, major_id: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { major_id: "desc" } },
      take: 10,
    }),
  ]);

  const [statuses, faculties, majors] = await prisma.$transaction([
    prisma.admission_statuses.findMany({
      where: {
        id: {
          in: applicationStatusGroups.flatMap((group) =>
            group.admission_status_id ? [group.admission_status_id] : [],
          ),
        },
      },
      select: { id: true, name: true },
    }),
    prisma.faculties.findMany({
      where: {
        id: { in: facultyGroups.flatMap((group) => (group.faculty_id ? [group.faculty_id] : [])) },
      },
      select: { id: true, name: true },
    }),
    prisma.majors.findMany({
      where: {
        id: { in: majorGroups.flatMap((group) => (group.major_id ? [group.major_id] : [])) },
      },
      select: { id: true, name: true },
    }),
  ]);

  const statusNames = new Map(statuses.map((status) => [status.id, status.name]));
  const facultyNames = new Map(faculties.map((faculty) => [faculty.id, faculty.name]));
  const majorNames = new Map(majors.map((major) => [major.id, major.name]));

  return {
    summary: {
      totalLeads,
      totalApplications,
      totalStudents,
      conversionRate: totalLeads === 0 ? 0 : Number(((totalStudents / totalLeads) * 100).toFixed(1)),
      monthlyRevenue: Number(revenue._sum.monthly_revenue?.toString() ?? 0),
    },
    applicationsByStatus: applicationStatusGroups.map((group) => ({
      id: group.admission_status_id,
      name: group.admission_status_id
        ? (statusNames.get(group.admission_status_id) ?? "Chưa xác định")
        : "Chưa có trạng thái",
      total: group._count._all,
    })),
    studentsByFaculty: facultyGroups.map((group) => ({
      id: group.faculty_id!,
      name: facultyNames.get(group.faculty_id!) ?? "Chưa xác định",
      total: group._count._all,
    })),
    applicationsByMajor: majorGroups.map((group) => ({
      id: group.major_id!,
      name: majorNames.get(group.major_id!) ?? "Chưa xác định",
      total: group._count._all,
    })),
  };
}

export async function getOverviewReportOptions() {
  const institutionPrograms = await prisma.institution_programs.findMany({
    where: { status: "active" },
    select: { id: true, name: true, institutions: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return {
    institutionPrograms: institutionPrograms.map((program) => ({
      id: program.id,
      name: program.name,
      institutionName: program.institutions.name,
    })),
  };
}
