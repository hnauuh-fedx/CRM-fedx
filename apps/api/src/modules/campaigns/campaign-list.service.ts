import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";

export type CampaignListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  type?: string;
  institutionProgramId?: string;
  sortBy: "createdAt" | "name" | "startDate" | "budget";
  sortOrder: "asc" | "desc";
};

export type CampaignViewer = Pick<AuthUser, "id" | "permissions" | "departmentIds" | "accessScope">;

const campaignSortFields = {
  createdAt: "created_at",
  name: "name",
  startDate: "start_date",
  budget: "budget",
} as const;

export function getCampaignVisibilityWhere(user: CampaignViewer) {
  const permissions = new Set(user.permissions);
  if (user.accessScope === "ALL" && permissions.has("campaign.view_all")) {
    return {};
  }
  if (user.accessScope === "OWNED_ONLY") {
    return { created_by: user.id };
  }
  if (user.accessScope === "DEPARTMENT" || permissions.has("campaign.view")) {
    if (user.departmentIds.length === 0) return { id: "00000000-0000-4000-8000-000000000000" };
    return {
      users: {
        is: {
          user_departments: {
            some: { department_id: { in: user.departmentIds } },
          },
        },
      },
    };
  }
  if (!permissions.has("campaign.view_own") && permissions.has("campaign.view_all")) {
    return {};
  }
  return { created_by: user.id };
}

export async function listCampaigns(user: CampaignViewer, query: CampaignListQuery) {
  const visibilityWhere = getCampaignVisibilityWhere(user);
  const where = {
    AND: [
      visibilityWhere,
      ...(query.search
        ? [{ name: { contains: query.search, mode: "insensitive" as const } }]
        : []),
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.type ? [{ type: query.type }] : []),
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
    ],
  };
  const orderBy = { [campaignSortFields[query.sortBy]]: query.sortOrder };
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.campaigns.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        start_date: true,
        end_date: true,
        budget: true,
        created_at: true,
        users: { select: { id: true, full_name: true } },
        institution_programs: { select: { id: true, name: true, institutions: { select: { name: true } } } },
        _count: { select: { marketing_forms: true, utm_trackings: true } },
      },
      orderBy: [orderBy, { id: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.campaigns.count({ where }),
  ]);
  const performance = await getCampaignPerformance(items.map((campaign) => campaign.id));

  return {
    data: items.map((campaign) => ({
      ...performance.get(campaign.id),
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      startDate: campaign.start_date?.toISOString() ?? null,
      endDate: campaign.end_date?.toISOString() ?? null,
      budget: Number(campaign.budget?.toString() ?? 0),
      createdAt: campaign.created_at?.toISOString() ?? null,
      creator: campaign.users
        ? { id: campaign.users.id, fullName: campaign.users.full_name }
        : null,
      institutionProgram: campaign.institution_programs
        ? { id: campaign.institution_programs.id, name: campaign.institution_programs.name, institutionName: campaign.institution_programs.institutions.name }
        : null,
      formCount: campaign._count.marketing_forms,
      utmTrackingCount: campaign._count.utm_trackings,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: {
      search: query.search ?? "",
      status: query.status ?? "",
      type: query.type ?? "",
      institutionProgramId: query.institutionProgramId ?? "",
    },
  };
}

export async function getCampaignFilterOptions(user: CampaignViewer, institutionProgramId?: string) {
  const visibilityWhere = getCampaignVisibilityWhere(user);
  const campaignScopeWhere = {
    AND: [
      visibilityWhere,
      ...(institutionProgramId ? [{ institution_program_id: institutionProgramId }] : []),
    ],
  };
  const [statuses, institutionPrograms, types] = await prisma.$transaction([
    prisma.campaigns.findMany({
      where: campaignScopeWhere,
      select: { status: true },
      distinct: ["status"],
      take: 100,
    }),
    prisma.institution_programs.findMany({
      where: { status: "active" },
      select: { id: true, name: true, institutions: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.campaigns.findMany({
      where: campaignScopeWhere,
      select: { type: true },
      distinct: ["type"],
      take: 100,
    }),
  ]);

  return {
    statuses: statuses.flatMap((campaign) => (campaign.status ? [campaign.status] : [])).sort(),
    types: types.flatMap((campaign) => (campaign.type ? [campaign.type] : [])).sort(),
    institutionPrograms: institutionPrograms.map((program) => ({ id: program.id, name: program.name, institutionName: program.institutions.name })),
  };
}

type CampaignMetricRow = {
  campaignId: string;
  leadCount: number | bigint;
  applicationCount: number | bigint;
  enrolledStudentCount: number | bigint;
};

async function getCampaignPerformance(campaignIds: string[]) {
  const metrics = new Map<string, {
    leadCount: number;
    applicationCount: number;
    enrolledStudentCount: number;
    conversionRate: number;
  }>();
  if (campaignIds.length === 0) {
    return metrics;
  }

  const rows = await prisma.$queryRaw<CampaignMetricRow[]>(Prisma.sql`
    SELECT
      tracking.campaign_id AS "campaignId",
      COUNT(DISTINCT tracking.lead_id)::int AS "leadCount",
      COUNT(DISTINCT application.lead_id)::int AS "applicationCount",
      COUNT(DISTINCT student.lead_id)::int AS "enrolledStudentCount"
    FROM utm_trackings tracking
    LEFT JOIN admission_profiles application ON application.lead_id = tracking.lead_id
    LEFT JOIN students student ON student.lead_id = tracking.lead_id
    WHERE tracking.campaign_id IN (${Prisma.join(campaignIds)})
      AND tracking.lead_id IS NOT NULL
    GROUP BY tracking.campaign_id
  `);
  for (const row of rows) {
    const leadCount = Number(row.leadCount);
    const applicationCount = Number(row.applicationCount);
    metrics.set(row.campaignId, {
      leadCount,
      applicationCount,
      enrolledStudentCount: Number(row.enrolledStudentCount),
      conversionRate: leadCount > 0 ? Number(((applicationCount / leadCount) * 100).toFixed(1)) : 0,
    });
  }
  for (const campaignId of campaignIds) {
    if (!metrics.has(campaignId)) {
      metrics.set(campaignId, {
        leadCount: 0,
        applicationCount: 0,
        enrolledStudentCount: 0,
        conversionRate: 0,
      });
    }
  }
  return metrics;
}
