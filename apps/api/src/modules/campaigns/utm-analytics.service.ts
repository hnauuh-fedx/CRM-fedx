import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { CampaignViewer } from "./campaign-list.service";
import { getReferenceCampaignVisibility } from "./marketing-reference.service";

export type UtmAnalyticsDimension = "source" | "campaign" | "utm";

export type UtmAnalyticsQuery = {
  dimension: UtmAnalyticsDimension;
  page: number;
  limit: number;
  source?: string;
  medium?: string;
  campaignId?: string;
  fromDate?: string;
  toDate?: string;
  institutionProgramId?: string;
};

export type UtmLeadDrilldownQuery = Omit<UtmAnalyticsQuery, "dimension"> & {
  groupSource?: string;
  groupMedium?: string;
  groupCampaign?: string;
  groupCampaignId?: string;
};

type SummaryRow = {
  trackingCount: number | bigint;
  leadCount: number | bigint;
  applicationCount: number | bigint;
  enrolledStudentCount: number | bigint;
};

type AnalyticsRow = {
  groupKey: string;
  source: string | null;
  medium: string | null;
  utmCampaign: string | null;
  campaignId: string | null;
  campaignName: string | null;
  budget: unknown;
  trackingCount: number | bigint;
  leadCount: number | bigint;
  applicationCount: number | bigint;
  enrolledStudentCount: number | bigint;
  totalGroups: number | bigint;
};

export async function getUtmAnalytics(user: CampaignViewer, query: UtmAnalyticsQuery) {
  const where = analyticsWhere(user, query);
  const [summaryRows, rows] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
      SELECT
        COUNT(tracking.id)::int AS "trackingCount",
        COUNT(DISTINCT tracking.lead_id)::int AS "leadCount",
        COUNT(DISTINCT application.lead_id)::int AS "applicationCount",
        COUNT(DISTINCT student.lead_id)::int AS "enrolledStudentCount"
      FROM utm_trackings tracking
      LEFT JOIN campaigns campaign ON campaign.id = tracking.campaign_id
      LEFT JOIN admission_profiles application ON application.lead_id = tracking.lead_id
      LEFT JOIN students student ON student.lead_id = tracking.lead_id
      WHERE ${where}
    `),
    getGroupedRows(query, where),
  ]);
  const summary = mapMetrics(summaryRows[0]);
  const total = Number(rows[0]?.totalGroups ?? 0);

  return {
    summary,
    data: rows.map((row) => {
      const metrics = mapMetrics(row);
      return {
        groupKey: row.groupKey,
        source: row.source,
        medium: row.medium,
        utmCampaign: row.utmCampaign,
        campaign: row.campaignId ? { id: row.campaignId, name: row.campaignName ?? "-" } : null,
        budget: Number(row.budget ?? 0),
        ...metrics,
        conversionRate: metrics.leadCount > 0
          ? Number(((metrics.applicationCount / metrics.leadCount) * 100).toFixed(1))
          : 0,
        costPerLead: query.dimension === "campaign" && metrics.leadCount > 0
          ? Number(row.budget ?? 0) / metrics.leadCount
          : null,
      };
    }),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    dimension: query.dimension,
  };
}

export async function listUtmGeneratedLeads(user: CampaignViewer, query: UtmLeadDrilldownQuery) {
  const trackingWhere = getDrilldownTrackingWhere(user, query);
  const where = {
    deleted_at: null,
    utm_trackings: { some: { AND: trackingWhere } },
  };
  const [items, total] = await prisma.$transaction([
    prisma.leads.findMany({
      where,
      select: {
        id: true,
        lead_code: true,
        full_name: true,
        status: true,
        created_at: true,
        lead_sources: { select: { name: true } },
        pipeline_stages: { select: { name: true } },
        admission_profiles: { select: { id: true } },
        students: { select: { id: true } },
        utm_trackings: {
          where: { AND: trackingWhere },
          select: {
            utm_source: true,
            utm_medium: true,
            utm_campaign: true,
            campaigns: { select: { id: true, name: true } },
          },
          orderBy: { created_at: "asc" },
          take: 1,
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.leads.count({ where }),
  ]);

  return {
    data: items.map((lead) => {
      const attribution = lead.utm_trackings[0];
      return {
        id: lead.id,
        leadCode: lead.lead_code,
        fullName: lead.full_name,
        status: lead.status,
        createdAt: lead.created_at?.toISOString() ?? null,
        sourceName: lead.lead_sources?.name ?? null,
        pipelineStageName: lead.pipeline_stages?.name ?? null,
        hasApplication: Boolean(lead.admission_profiles),
        hasStudent: Boolean(lead.students),
        attribution: attribution
          ? {
              source: attribution.utm_source,
              medium: attribution.utm_medium,
              utmCampaign: attribution.utm_campaign,
              campaign: attribution.campaigns,
            }
          : null,
      };
    }),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

function getGroupedRows(query: UtmAnalyticsQuery, where: Prisma.Sql) {
  const offset = (query.page - 1) * query.limit;
  if (query.dimension === "campaign") {
    return prisma.$queryRaw<AnalyticsRow[]>(Prisma.sql`
      SELECT
        COALESCE(campaign.id::text, CONCAT('utm:', COALESCE(CASE WHEN campaign.id IS NULL THEN tracking.utm_campaign ELSE NULL END, '(not-set)'))) AS "groupKey",
        NULL::text AS "source",
        NULL::text AS "medium",
        CASE WHEN campaign.id IS NULL THEN tracking.utm_campaign ELSE NULL END AS "utmCampaign",
        campaign.id AS "campaignId",
        COALESCE(campaign.name, CASE WHEN campaign.id IS NULL THEN tracking.utm_campaign ELSE NULL END, 'Chưa xác định') AS "campaignName",
        COALESCE(MAX(campaign.budget), 0) AS "budget",
        COUNT(tracking.id)::int AS "trackingCount",
        COUNT(DISTINCT tracking.lead_id)::int AS "leadCount",
        COUNT(DISTINCT application.lead_id)::int AS "applicationCount",
        COUNT(DISTINCT student.lead_id)::int AS "enrolledStudentCount",
        COUNT(*) OVER()::int AS "totalGroups"
      FROM utm_trackings tracking
      LEFT JOIN campaigns campaign ON campaign.id = tracking.campaign_id
      LEFT JOIN admission_profiles application ON application.lead_id = tracking.lead_id
      LEFT JOIN students student ON student.lead_id = tracking.lead_id
      WHERE ${where}
      GROUP BY campaign.id, campaign.name, CASE WHEN campaign.id IS NULL THEN tracking.utm_campaign ELSE NULL END
      ORDER BY COUNT(DISTINCT tracking.lead_id) DESC, "campaignName" ASC
      LIMIT ${query.limit} OFFSET ${offset}
    `);
  }
  if (query.dimension === "utm") {
    return prisma.$queryRaw<AnalyticsRow[]>(Prisma.sql`
      SELECT
        CONCAT(COALESCE(tracking.utm_source, '(not-set)'), '|', COALESCE(tracking.utm_medium, '(not-set)'), '|', COALESCE(tracking.utm_campaign, '(not-set)')) AS "groupKey",
        tracking.utm_source AS "source",
        tracking.utm_medium AS "medium",
        tracking.utm_campaign AS "utmCampaign",
        NULL::uuid AS "campaignId",
        NULL::text AS "campaignName",
        0::numeric AS "budget",
        COUNT(tracking.id)::int AS "trackingCount",
        COUNT(DISTINCT tracking.lead_id)::int AS "leadCount",
        COUNT(DISTINCT application.lead_id)::int AS "applicationCount",
        COUNT(DISTINCT student.lead_id)::int AS "enrolledStudentCount",
        COUNT(*) OVER()::int AS "totalGroups"
      FROM utm_trackings tracking
      LEFT JOIN campaigns campaign ON campaign.id = tracking.campaign_id
      LEFT JOIN admission_profiles application ON application.lead_id = tracking.lead_id
      LEFT JOIN students student ON student.lead_id = tracking.lead_id
      WHERE ${where}
      GROUP BY tracking.utm_source, tracking.utm_medium, tracking.utm_campaign
      ORDER BY COUNT(DISTINCT tracking.lead_id) DESC, tracking.utm_source ASC, tracking.utm_medium ASC, tracking.utm_campaign ASC
      LIMIT ${query.limit} OFFSET ${offset}
    `);
  }
  return prisma.$queryRaw<AnalyticsRow[]>(Prisma.sql`
    SELECT
      COALESCE(tracking.utm_source, '(not-set)') AS "groupKey",
      tracking.utm_source AS "source",
      NULL::text AS "medium",
      NULL::text AS "utmCampaign",
      NULL::uuid AS "campaignId",
      NULL::text AS "campaignName",
      0::numeric AS "budget",
      COUNT(tracking.id)::int AS "trackingCount",
      COUNT(DISTINCT tracking.lead_id)::int AS "leadCount",
      COUNT(DISTINCT application.lead_id)::int AS "applicationCount",
      COUNT(DISTINCT student.lead_id)::int AS "enrolledStudentCount",
      COUNT(*) OVER()::int AS "totalGroups"
    FROM utm_trackings tracking
    LEFT JOIN campaigns campaign ON campaign.id = tracking.campaign_id
    LEFT JOIN admission_profiles application ON application.lead_id = tracking.lead_id
    LEFT JOIN students student ON student.lead_id = tracking.lead_id
    WHERE ${where}
    GROUP BY tracking.utm_source
    ORDER BY COUNT(DISTINCT tracking.lead_id) DESC, tracking.utm_source ASC
    LIMIT ${query.limit} OFFSET ${offset}
  `);
}

function analyticsWhere(user: CampaignViewer, query: UtmAnalyticsQuery) {
  const clauses: Prisma.Sql[] = [];
  if (!user.permissions.includes("campaign.view_all")) {
    if (user.permissions.includes("campaign.view")) {
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
  if (query.source) clauses.push(Prisma.sql`tracking.utm_source = ${query.source}`);
  if (query.medium) clauses.push(Prisma.sql`tracking.utm_medium = ${query.medium}`);
  if (query.campaignId) clauses.push(Prisma.sql`tracking.campaign_id = ${query.campaignId}::uuid`);
  if (query.institutionProgramId) clauses.push(Prisma.sql`campaign.institution_program_id = ${query.institutionProgramId}::uuid`);
  if (query.fromDate) clauses.push(Prisma.sql`tracking.created_at >= ${new Date(`${query.fromDate}T00:00:00.000Z`)}`);
  if (query.toDate) clauses.push(Prisma.sql`tracking.created_at <= ${new Date(`${query.toDate}T23:59:59.999Z`)}`);
  return clauses.length > 0 ? Prisma.join(clauses, " AND ") : Prisma.sql`TRUE`;
}

function getDrilldownTrackingWhere(user: CampaignViewer, query: UtmLeadDrilldownQuery) {
  const where: Prisma.utm_trackingsWhereInput[] = [
    ...getReferenceCampaignVisibility(user),
    ...(query.source ? [{ utm_source: query.source }] : []),
    ...(query.medium ? [{ utm_medium: query.medium }] : []),
    ...(query.campaignId ? [{ campaign_id: query.campaignId }] : []),
    ...(query.institutionProgramId ? [{ campaigns: { is: { institution_program_id: query.institutionProgramId } } }] : []),
    ...(query.fromDate ? [{ created_at: { gte: new Date(`${query.fromDate}T00:00:00.000Z`) } }] : []),
    ...(query.toDate ? [{ created_at: { lte: new Date(`${query.toDate}T23:59:59.999Z`) } }] : []),
    ...(query.groupSource ? [{ utm_source: nullableGroupValue(query.groupSource) }] : []),
    ...(query.groupMedium ? [{ utm_medium: nullableGroupValue(query.groupMedium) }] : []),
    ...(query.groupCampaign ? [{ utm_campaign: nullableGroupValue(query.groupCampaign) }] : []),
    ...(query.groupCampaignId ? [{ campaign_id: query.groupCampaignId }] : []),
  ];
  return where;
}

function nullableGroupValue(value: string) {
  return value === "__unset__" ? null : value;
}

function mapMetrics(row: Pick<SummaryRow, "trackingCount" | "leadCount" | "applicationCount" | "enrolledStudentCount"> | undefined) {
  return {
    trackingCount: Number(row?.trackingCount ?? 0),
    leadCount: Number(row?.leadCount ?? 0),
    applicationCount: Number(row?.applicationCount ?? 0),
    enrolledStudentCount: Number(row?.enrolledStudentCount ?? 0),
  };
}
