import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import type { CampaignViewer } from "../campaigns/campaign-list.service";
import { getLeadScopeWhere } from "../leads/lead-list.service";

export type ReportDateRange = {
  fromDate?: string;
  toDate?: string;
  institutionProgramId?: string;
};

type MarketingSummaryRow = {
  campaignCount: number | bigint;
  totalBudget: unknown;
  trackingCount: number | bigint;
  leadCount: number | bigint;
  applicationCount: number | bigint;
  enrolledStudentCount: number | bigint;
  formCount: number | bigint;
};

type MarketingPerformanceRow = {
  id: string | null;
  name: string | null;
  type: string | null;
  status: string | null;
  budget: unknown;
  trackingCount: number | bigint;
  leadCount: number | bigint;
  applicationCount: number | bigint;
  enrolledStudentCount: number | bigint;
};

type SourcePerformanceRow = {
  source: string | null;
  trackingCount: number | bigint;
  leadCount: number | bigint;
  applicationCount: number | bigint;
  enrolledStudentCount: number | bigint;
};

type AdmissionWhere = Prisma.admission_profilesWhereInput;
type StudentWhere = Prisma.studentsWhereInput;

export async function getMarketingDetailReport(user: CampaignViewer, query: ReportDateRange) {
  const where = marketingWhere(user, query);
  const [summaryRows, campaignRows, sourceRows] = await Promise.all([
    prisma.$queryRaw<MarketingSummaryRow[]>(Prisma.sql`
      WITH scoped_campaigns AS (
        SELECT campaign.id, campaign.budget
        FROM campaigns campaign
        WHERE ${where}
      )
      SELECT
        (SELECT COUNT(*)::int FROM scoped_campaigns) AS "campaignCount",
        (SELECT COALESCE(SUM(budget), 0) FROM scoped_campaigns) AS "totalBudget",
        COUNT(tracking.id)::int AS "trackingCount",
        COUNT(DISTINCT tracking.lead_id)::int AS "leadCount",
        COUNT(DISTINCT application.lead_id)::int AS "applicationCount",
        COUNT(DISTINCT student.lead_id)::int AS "enrolledStudentCount",
        (SELECT COUNT(*)::int FROM marketing_forms form WHERE form.campaign_id IN (SELECT id FROM scoped_campaigns)) AS "formCount"
      FROM scoped_campaigns campaign
      LEFT JOIN utm_trackings tracking ON tracking.campaign_id = campaign.id
      LEFT JOIN admission_profiles application ON application.lead_id = tracking.lead_id
      LEFT JOIN students student ON student.lead_id = tracking.lead_id
    `),
    prisma.$queryRaw<MarketingPerformanceRow[]>(Prisma.sql`
      SELECT
        campaign.id,
        campaign.name,
        campaign.type,
        campaign.status,
        COALESCE(campaign.budget, 0) AS "budget",
        COUNT(tracking.id)::int AS "trackingCount",
        COUNT(DISTINCT tracking.lead_id)::int AS "leadCount",
        COUNT(DISTINCT application.lead_id)::int AS "applicationCount",
        COUNT(DISTINCT student.lead_id)::int AS "enrolledStudentCount"
      FROM campaigns campaign
      LEFT JOIN utm_trackings tracking ON tracking.campaign_id = campaign.id
      LEFT JOIN admission_profiles application ON application.lead_id = tracking.lead_id
      LEFT JOIN students student ON student.lead_id = tracking.lead_id
      WHERE ${where}
      GROUP BY campaign.id, campaign.name, campaign.type, campaign.status, campaign.budget
      ORDER BY COUNT(DISTINCT tracking.lead_id) DESC, campaign.created_at DESC, campaign.id ASC
      LIMIT 10
    `),
    prisma.$queryRaw<SourcePerformanceRow[]>(Prisma.sql`
      SELECT
        tracking.utm_source AS "source",
        COUNT(tracking.id)::int AS "trackingCount",
        COUNT(DISTINCT tracking.lead_id)::int AS "leadCount",
        COUNT(DISTINCT application.lead_id)::int AS "applicationCount",
        COUNT(DISTINCT student.lead_id)::int AS "enrolledStudentCount"
      FROM campaigns campaign
      JOIN utm_trackings tracking ON tracking.campaign_id = campaign.id
      LEFT JOIN admission_profiles application ON application.lead_id = tracking.lead_id
      LEFT JOIN students student ON student.lead_id = tracking.lead_id
      WHERE ${where}
      GROUP BY tracking.utm_source
      ORDER BY COUNT(DISTINCT tracking.lead_id) DESC, tracking.utm_source ASC
      LIMIT 10
    `),
  ]);

  const summary = summaryRows[0];
  const leadCount = Number(summary?.leadCount ?? 0);
  const applicationCount = Number(summary?.applicationCount ?? 0);

  return {
    filters: normalizedFilters(query),
    summary: {
      campaignCount: Number(summary?.campaignCount ?? 0),
      totalBudget: Number(summary?.totalBudget ?? 0),
      trackingCount: Number(summary?.trackingCount ?? 0),
      leadCount,
      applicationCount,
      enrolledStudentCount: Number(summary?.enrolledStudentCount ?? 0),
      formCount: Number(summary?.formCount ?? 0),
      leadToApplicationRate: leadCount > 0 ? Number(((applicationCount / leadCount) * 100).toFixed(1)) : 0,
    },
    topCampaigns: campaignRows.map((row) => {
      const metrics = marketingMetrics(row);
      return {
        id: row.id,
        name: row.name ?? "Chưa xác định",
        type: row.type,
        status: row.status,
        budget: Number(row.budget ?? 0),
        ...metrics,
        conversionRate: metrics.leadCount > 0 ? Number(((metrics.applicationCount / metrics.leadCount) * 100).toFixed(1)) : 0,
        costPerLead: metrics.leadCount > 0 ? Number(row.budget ?? 0) / metrics.leadCount : null,
      };
    }),
    sourcePerformance: sourceRows.map((row) => ({
      id: row.source,
      name: row.source ?? "Chưa xác định",
      ...marketingMetrics(row),
      conversionRate: Number(row.leadCount) > 0
        ? Number(((Number(row.applicationCount) / Number(row.leadCount)) * 100).toFixed(1))
        : 0,
    })),
  };
}

export async function getSaleDetailReport(user: AuthUser, query: ReportDateRange) {
  const leadWhere = {
    AND: [
      { deleted_at: null },
      getLeadScopeWhere(user),
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
      ...dateWhere("created_at", query),
    ],
  };
  const scopedLeadWhere = {
    deleted_at: null,
    ...getLeadScopeWhere(user),
    ...(query.institutionProgramId ? { institution_program_id: query.institutionProgramId } : {}),
  };
  const [totalLeads, assignedLeads, unassignedLeads, activityCount, pendingReminders, overdueReminders, stageGroups, staffGroups] =
    await prisma.$transaction([
      prisma.leads.count({ where: leadWhere }),
      prisma.leads.count({ where: { AND: [...leadWhere.AND, { assigned_to: { not: null } }] } }),
      prisma.leads.count({ where: { AND: [...leadWhere.AND, { assigned_to: null }] } }),
      prisma.lead_activities.count({
        where: { leads: { is: scopedLeadWhere }, ...dateWhereObject("created_at", query) },
      }),
      prisma.reminders.count({ where: { status: "pending", leads: { is: scopedLeadWhere } } }),
      prisma.reminders.count({ where: { status: "pending", remind_at: { lt: new Date() }, leads: { is: scopedLeadWhere } } }),
      prisma.leads.groupBy({
        by: ["pipeline_stage_id"],
        where: leadWhere,
        _count: { _all: true },
        orderBy: { _count: { pipeline_stage_id: "desc" } },
        take: 10,
      }),
      prisma.leads.groupBy({
        by: ["assigned_to"],
        where: { AND: [...leadWhere.AND, { assigned_to: { not: null } }] },
        _count: { _all: true },
        orderBy: { _count: { assigned_to: "desc" } },
        take: 10,
      }),
    ]);

  const assigneeIds = staffGroups.flatMap((group) => (group.assigned_to ? [group.assigned_to] : []));
  const [stages, staffIds, staffApplicationCounts, staffStudentCounts] = await Promise.all([
    prisma.pipeline_stages.findMany({
      where: { id: { in: stageGroups.flatMap((group) => (group.pipeline_stage_id ? [group.pipeline_stage_id] : [])) } },
      select: { id: true, name: true, position: true },
    }),
    prisma.users.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, full_name: true },
    }),
    Promise.all(assigneeIds.map(async (assigneeId) => ({
      assigneeId,
      total: await prisma.admission_profiles.count({
        where: {
          leads: { is: { ...scopedLeadWhere, assigned_to: assigneeId } },
          ...dateWhereObject("created_at", query),
        },
      }),
    }))),
    Promise.all(assigneeIds.map(async (assigneeId) => ({
      assigneeId,
      total: await prisma.students.count({
        where: {
          leads: { is: { ...scopedLeadWhere, assigned_to: assigneeId } },
          ...dateWhereObject("created_at", query),
        },
      }),
    }))),
  ]);

  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const staffNames = new Map(staffIds.map((staff) => [staff.id, staff.full_name]));
  const applicationsByStaff = new Map(staffApplicationCounts.map((group) => [group.assigneeId, group.total]));
  const studentsByStaff = new Map(staffStudentCounts.map((group) => [group.assigneeId, group.total]));

  return {
    filters: normalizedFilters(query),
    summary: {
      totalLeads,
      assignedLeads,
      unassignedLeads,
      activityCount,
      pendingReminders,
      overdueReminders,
      assignmentRate: totalLeads > 0 ? Number(((assignedLeads / totalLeads) * 100).toFixed(1)) : 0,
    },
    pipelineBreakdown: stageGroups.map((group) => ({
      id: group.pipeline_stage_id,
      name: group.pipeline_stage_id ? (stageNames.get(group.pipeline_stage_id) ?? "Chưa xác định") : "Chưa có giai đoạn",
      total: group._count._all,
    })),
    staffPerformance: staffGroups.map((group) => {
      const assignedLeadCount = group._count._all;
      const applicationCount = applicationsByStaff.get(group.assigned_to ?? "") ?? 0;
      return {
        id: group.assigned_to,
        name: group.assigned_to ? (staffNames.get(group.assigned_to) ?? "Chưa xác định") : "Chưa phân công",
        assignedLeadCount,
        applicationCount,
        enrolledStudentCount: studentsByStaff.get(group.assigned_to ?? "") ?? 0,
        conversionRate: assignedLeadCount > 0 ? Number(((applicationCount / assignedLeadCount) * 100).toFixed(1)) : 0,
      };
    }),
  };
}

export async function getAdmissionDetailReport(user: AuthUser, query: ReportDateRange) {
  const admissionWhere = buildAdmissionWhere(user, query);
  const scopedLeadWhere = {
    deleted_at: null,
    ...getLeadScopeWhere(user),
    ...(query.institutionProgramId ? { institution_program_id: query.institutionProgramId } : {}),
  };
  const [
    totalApplications,
    enrolledStudentCount,
    totalRevenue,
    documentCount,
    pendingDocumentCount,
    statusGroups,
    majorGroups,
    feeStatusGroups,
    tuitionStatusGroups,
    recentApplications,
  ] = await prisma.$transaction([
    prisma.admission_profiles.count({ where: admissionWhere }),
    prisma.admission_profiles.count({ where: { AND: [admissionWhere, { students: { isNot: null } }] } }),
    prisma.admission_profiles.aggregate({ where: admissionWhere, _sum: { monthly_revenue: true } }),
    prisma.admission_documents.count({
      where: { leads: { is: scopedLeadWhere }, ...dateWhereObject("uploaded_at", query) },
    }),
    prisma.admission_documents.count({
      where: {
        status: { in: ["pending", "missing", "rejected"] },
        leads: { is: scopedLeadWhere },
        ...dateWhereObject("uploaded_at", query),
      },
    }),
    prisma.admission_profiles.groupBy({
      by: ["admission_status_id"],
      where: admissionWhere,
      _count: { _all: true },
      orderBy: { _count: { admission_status_id: "desc" } },
      take: 10,
    }),
    prisma.admission_profiles.groupBy({
      by: ["major_id"],
      where: admissionWhere,
      _count: { _all: true },
      orderBy: { _count: { major_id: "desc" } },
      take: 10,
    }),
    prisma.admission_profiles.groupBy({
      by: ["fee_status"],
      where: admissionWhere,
      _count: { _all: true },
      orderBy: { _count: { fee_status: "desc" } },
      take: 10,
    }),
    prisma.admission_profiles.groupBy({
      by: ["tuition_status"],
      where: admissionWhere,
      _count: { _all: true },
      orderBy: { _count: { tuition_status: "desc" } },
      take: 10,
    }),
    prisma.admission_profiles.findMany({
      where: admissionWhere,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        admission_code: true,
        application_received_date: true,
        fee_status: true,
        tuition_status: true,
        monthly_revenue: true,
        admission_statuses: { select: { name: true, color: true } },
        majors: { select: { name: true, faculties: { select: { name: true } } } },
        leads: { select: { full_name: true } },
      },
    }),
  ]);

  const [statuses, majors] = await Promise.all([
    prisma.admission_statuses.findMany({
      where: { id: { in: statusGroups.flatMap((group) => (group.admission_status_id ? [group.admission_status_id] : [])) } },
      select: { id: true, name: true, color: true },
    }),
    prisma.majors.findMany({
      where: { id: { in: majorGroups.flatMap((group) => (group.major_id ? [group.major_id] : [])) } },
      select: { id: true, name: true, faculties: { select: { name: true } } },
    }),
  ]);

  const statusNames = new Map(statuses.map((status) => [status.id, { name: status.name, color: status.color }]));
  const majorNames = new Map(majors.map((major) => [major.id, { name: major.name, facultyName: major.faculties?.name ?? null }]));

  return {
    filters: normalizedFilters(query),
    summary: {
      totalApplications,
      enrolledStudentCount,
      conversionRate: totalApplications > 0 ? Number(((enrolledStudentCount / totalApplications) * 100).toFixed(1)) : 0,
      monthlyRevenue: Number(totalRevenue._sum.monthly_revenue ?? 0),
      documentCount,
      pendingDocumentCount,
    },
    applicationsByStatus: statusGroups.map((group) => {
      const status = group.admission_status_id ? statusNames.get(group.admission_status_id) : null;
      return {
        id: group.admission_status_id,
        name: status?.name ?? "Chưa có trạng thái",
        color: status?.color ?? null,
        total: group._count._all,
      };
    }),
    applicationsByMajor: majorGroups.map((group) => {
      const major = group.major_id ? majorNames.get(group.major_id) : null;
      return {
        id: group.major_id,
        name: major?.name ?? "Chưa có ngành",
        facultyName: major?.facultyName ?? null,
        total: group._count._all,
      };
    }),
    feeStatusBreakdown: feeStatusGroups.map((group) => ({
      id: group.fee_status,
      name: normalizeStatusLabel(group.fee_status),
      total: group._count._all,
    })),
    tuitionStatusBreakdown: tuitionStatusGroups.map((group) => ({
      id: group.tuition_status,
      name: normalizeStatusLabel(group.tuition_status),
      total: group._count._all,
    })),
    recentApplications: recentApplications.map((application) => ({
      id: application.id,
      admissionCode: application.admission_code,
      leadName: application.leads?.full_name ?? "Chưa xác định",
      statusName: application.admission_statuses?.name ?? "Chưa có trạng thái",
      statusColor: application.admission_statuses?.color ?? null,
      majorName: application.majors?.name ?? "Chưa có ngành",
      facultyName: application.majors?.faculties?.name ?? null,
      applicationReceivedDate: application.application_received_date?.toISOString() ?? null,
      feeStatus: application.fee_status,
      tuitionStatus: application.tuition_status,
      monthlyRevenue: Number(application.monthly_revenue ?? 0),
    })),
  };
}

export async function getStudentDetailReport(user: AuthUser, query: ReportDateRange) {
  const studentWhere = buildStudentWhere(user, query);
  const [
    totalStudents,
    activeStudents,
    studentsWithClass,
    serviceRequestCount,
    openServiceRequestCount,
    statusGroups,
    facultyGroups,
    majorGroups,
    classGroups,
    serviceTypeGroups,
    recentStudents,
  ] = await prisma.$transaction([
    prisma.students.count({ where: studentWhere }),
    prisma.students.count({ where: { AND: [studentWhere, { status: "active" }] } }),
    prisma.students.count({ where: { AND: [studentWhere, { class_id: { not: null } }] } }),
    prisma.student_services.count({
      where: { students: { is: studentWhere }, ...dateWhereObject("created_at", query) },
    }),
    prisma.student_services.count({
      where: { status: { in: ["open", "pending"] }, students: { is: studentWhere }, ...dateWhereObject("created_at", query) },
    }),
    prisma.students.groupBy({
      by: ["status"],
      where: studentWhere,
      _count: { _all: true },
      orderBy: { _count: { status: "desc" } },
      take: 10,
    }),
    prisma.students.groupBy({
      by: ["faculty_id"],
      where: studentWhere,
      _count: { _all: true },
      orderBy: { _count: { faculty_id: "desc" } },
      take: 10,
    }),
    prisma.students.groupBy({
      by: ["major_id"],
      where: studentWhere,
      _count: { _all: true },
      orderBy: { _count: { major_id: "desc" } },
      take: 10,
    }),
    prisma.students.groupBy({
      by: ["class_id"],
      where: studentWhere,
      _count: { _all: true },
      orderBy: { _count: { class_id: "desc" } },
      take: 10,
    }),
    prisma.student_services.groupBy({
      by: ["type"],
      where: { students: { is: studentWhere }, ...dateWhereObject("created_at", query) },
      _count: { _all: true },
      orderBy: { _count: { type: "desc" } },
      take: 10,
    }),
    prisma.students.findMany({
      where: studentWhere,
      orderBy: [{ enrolled_at: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        student_code: true,
        status: true,
        enrolled_at: true,
        leads: { select: { full_name: true } },
        majors: { select: { name: true } },
        faculties: { select: { name: true } },
        student_classes: { select: { name: true, code: true } },
      },
    }),
  ]);

  const [faculties, majors, classes] = await Promise.all([
    prisma.faculties.findMany({
      where: { id: { in: facultyGroups.flatMap((group) => (group.faculty_id ? [group.faculty_id] : [])) } },
      select: { id: true, name: true },
    }),
    prisma.majors.findMany({
      where: { id: { in: majorGroups.flatMap((group) => (group.major_id ? [group.major_id] : [])) } },
      select: { id: true, name: true, faculties: { select: { name: true } } },
    }),
    prisma.student_classes.findMany({
      where: { id: { in: classGroups.flatMap((group) => (group.class_id ? [group.class_id] : [])) } },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const facultyNames = new Map(faculties.map((faculty) => [faculty.id, faculty.name]));
  const majorNames = new Map(majors.map((major) => [major.id, { name: major.name, facultyName: major.faculties?.name ?? null }]));
  const classNames = new Map(classes.map((studentClass) => [studentClass.id, [studentClass.code, studentClass.name].filter(Boolean).join(" - ")]));

  return {
    filters: normalizedFilters(query),
    summary: {
      totalStudents,
      activeStudents,
      studentsWithClass,
      serviceRequestCount,
      openServiceRequestCount,
      classAssignmentRate: totalStudents > 0 ? Number(((studentsWithClass / totalStudents) * 100).toFixed(1)) : 0,
    },
    studentsByStatus: statusGroups.map((group) => ({
      id: group.status,
      name: normalizeStatusLabel(group.status),
      total: group._count._all,
    })),
    studentsByFaculty: facultyGroups.map((group) => ({
      id: group.faculty_id,
      name: group.faculty_id ? (facultyNames.get(group.faculty_id) ?? "Chưa xác định") : "Chưa có khoa",
      total: group._count._all,
    })),
    studentsByMajor: majorGroups.map((group) => {
      const major = group.major_id ? majorNames.get(group.major_id) : null;
      return {
        id: group.major_id,
        name: major?.name ?? "Chưa có ngành",
        facultyName: major?.facultyName ?? null,
        total: group._count._all,
      };
    }),
    studentsByClass: classGroups.map((group) => ({
      id: group.class_id,
      name: group.class_id ? (classNames.get(group.class_id) ?? "Chưa xác định") : "Chưa có lớp",
      total: group._count._all,
    })),
    serviceTypes: serviceTypeGroups.map((group) => ({
      id: group.type,
      name: normalizeStatusLabel(group.type),
      total: group._count._all,
    })),
    recentStudents: recentStudents.map((student) => ({
      id: student.id,
      studentCode: student.student_code,
      leadName: student.leads?.full_name ?? "Chưa xác định",
      status: student.status,
      majorName: student.majors?.name ?? "Chưa có ngành",
      facultyName: student.faculties?.name ?? null,
      className: [student.student_classes?.code, student.student_classes?.name].filter(Boolean).join(" - ") || null,
      enrolledAt: student.enrolled_at?.toISOString() ?? null,
    })),
  };
}

function marketingWhere(user: CampaignViewer, query: ReportDateRange) {
  const clauses: Prisma.Sql[] = [];
  if (!user.permissions.includes("campaign.view_all") && !user.permissions.includes("report.view_all")) {
    if (user.permissions.includes("campaign.view") || user.permissions.includes("report.marketing.view")) {
      clauses.push(user.departmentIds.length > 0
        ? Prisma.sql`EXISTS (
            SELECT 1 FROM user_departments department_scope
            WHERE department_scope.user_id = campaign.created_by
              AND department_scope.department_id IN (${Prisma.join(user.departmentIds)})
          )`
        : Prisma.sql`FALSE`);
    } else {
      clauses.push(Prisma.sql`campaign.created_by = ${user.id}`);
    }
  }
  if (query.institutionProgramId) clauses.push(Prisma.sql`campaign.institution_program_id = ${query.institutionProgramId}::uuid`);
  if (query.fromDate) clauses.push(Prisma.sql`campaign.created_at >= ${new Date(`${query.fromDate}T00:00:00.000Z`)}`);
  if (query.toDate) clauses.push(Prisma.sql`campaign.created_at <= ${new Date(`${query.toDate}T23:59:59.999Z`)}`);
  return clauses.length > 0 ? Prisma.join(clauses, " AND ") : Prisma.sql`TRUE`;
}

function buildAdmissionWhere(user: AuthUser, query: ReportDateRange): AdmissionWhere {
  return {
    AND: [
      { leads: { is: { deleted_at: null, ...getLeadScopeWhere(user) } } },
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
      ...dateWhere("created_at", query),
    ],
  };
}

function buildStudentWhere(user: AuthUser, query: ReportDateRange): StudentWhere {
  return {
    AND: [
      { leads: { is: { deleted_at: null, ...getLeadScopeWhere(user) } } },
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
      ...dateWhere("enrolled_at", query),
    ],
  };
}

function dateWhere(field: "created_at" | "enrolled_at" | "uploaded_at", query: ReportDateRange) {
  const range = dateWhereObject(field, query);
  return Object.keys(range).length > 0 ? [{ [field]: range[field] }] : [];
}

function dateWhereObject(field: "created_at" | "enrolled_at" | "uploaded_at", query: ReportDateRange) {
  const range: { gte?: Date; lte?: Date } = {};
  if (query.fromDate) range.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
  if (query.toDate) range.lte = new Date(`${query.toDate}T23:59:59.999Z`);
  return Object.keys(range).length > 0 ? { [field]: range } : {};
}

function normalizedFilters(query: ReportDateRange) {
  return {
    fromDate: query.fromDate ?? "",
    toDate: query.toDate ?? "",
    institutionProgramId: query.institutionProgramId ?? "",
  };
}

function marketingMetrics(row: Pick<MarketingPerformanceRow, "trackingCount" | "leadCount" | "applicationCount" | "enrolledStudentCount">) {
  return {
    trackingCount: Number(row.trackingCount ?? 0),
    leadCount: Number(row.leadCount ?? 0),
    applicationCount: Number(row.applicationCount ?? 0),
    enrolledStudentCount: Number(row.enrolledStudentCount ?? 0),
  };
}

function normalizeStatusLabel(value: string | null) {
  if (!value) return "Chưa xác định";
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
