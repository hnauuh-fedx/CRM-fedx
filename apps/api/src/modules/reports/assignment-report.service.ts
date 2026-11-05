import type { AssignmentReportQuery, AssignmentReportResponse, AssignmentCounts, AssignmentDetailResponse, AssignmentEventType, AssignmentOptionKind } from "@admission-crm/shared/assignment-report";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { assignmentReportScope, assignmentReportWhere } from "./assignment-report-query";

const countsSql = Prisma.sql`COUNT(*) FILTER (WHERE e.event_type='ASSIGNED')::int AS "ASSIGNED",
  COUNT(*) FILTER (WHERE e.event_type='WARNING_1')::int AS "WARNING_1",
  COUNT(*) FILTER (WHERE e.event_type='WARNING_2')::int AS "WARNING_2",
  COUNT(*) FILTER (WHERE e.event_type='WITHDRAWN')::int AS "WITHDRAWN"`;

export async function getAssignmentReport(user: AuthUser, programId: string, query: AssignmentReportQuery): Promise<AssignmentReportResponse> {
  const where = assignmentReportWhere(user, programId, query);
  const order = query.sortBy === "name" ? Prisma.sql`name` : Prisma.raw(`"${query.sortBy}"`);
  // One repeatable snapshot prevents concurrent assignments making totals disagree with rows.
  return prisma.$transaction(async (tx) => {
    const summary = await tx.$queryRaw<(AssignmentCounts & { total: number })[]>(Prisma.sql`
      SELECT ${countsSql},COUNT(DISTINCT e.assignee_id)::int AS total FROM lead_assignment_report_events e WHERE ${where}`);
    const rows = await tx.$queryRaw<AssignmentReportResponse["rows"]>(Prisma.sql`
      SELECT e.assignee_id AS "assigneeId",MAX(e.assignee_name) AS name,${countsSql}
      FROM lead_assignment_report_events e WHERE ${where} GROUP BY e.assignee_id
      ORDER BY ${order} ${Prisma.raw(query.sortOrder === "asc" ? "ASC" : "DESC")},e.assignee_id ASC
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`);
    const coverage = await tx.$queryRaw<{ started_at: Date }[]>`SELECT started_at FROM lead_assignment_report_coverage WHERE id=1`;
    const { total, ...counts } = summary[0];
    return { summary: counts, rows, pagination: { page: query.page, limit: query.limit, total }, recordedFrom: coverage[0].started_at.toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

type EventRow = {
  id: string; lead_id: string; occurred_at: Date; event_type: AssignmentEventType; assignee_name: string;
  source_name: string | null; campaign_names: string[]; rule_name: string | null; node_id: string | null;
  method: "MANUAL" | "AUTOMATIC"; reason: string;
};
export async function getAssignmentEventDetails(user: AuthUser, programId: string, query: AssignmentReportQuery): Promise<AssignmentDetailResponse> {
  const where = assignmentReportWhere(user, programId, query);
  return prisma.$transaction(async (tx) => {
    const totals = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS total FROM lead_assignment_report_events e WHERE ${where}`);
    const rows = await tx.$queryRaw<EventRow[]>(Prisma.sql`SELECT e.id,e.lead_id,e.occurred_at,e.event_type,e.assignee_name,
      e.source_name,e.campaign_names,e.rule_name,e.node_id,e.method,e.reason
      FROM lead_assignment_report_events e WHERE ${where} ORDER BY e.occurred_at DESC,e.id DESC
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`);
    // Report permission does not grant access to a lead's identity. Check current lead scope separately.
    const leads = await tx.leads.findMany({ where: { AND: [getLeadScopeWhere(user, programId), {
      id: { in: rows.map((row) => row.lead_id) }, institution_program_id: programId, deleted_at: null,
    }] }, select: { id: true, lead_code: true, full_name: true } });
    const visible = new Map(leads.map((lead) => [lead.id, lead]));
    return { rows: rows.map((row) => {
      const lead = visible.get(row.lead_id);
      return { id: row.id, occurredAt: row.occurred_at.toISOString(), type: row.event_type,
        assigneeName: row.assignee_name, leadId: lead?.id ?? null, leadCode: lead?.lead_code ?? null, leadName: lead?.full_name ?? null,
        sourceName: row.source_name, campaignNames: row.campaign_names, ruleName: row.rule_name, nodeId: row.node_id, method: row.method, reason: row.reason };
    }), pagination: { page: query.page, limit: query.limit, total: totals[0].total } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function getAssignmentFilterOptions(user: AuthUser, programId: string, query: { kind: AssignmentOptionKind; search: string; page: number; departmentIds: string[] }) {
  const columns = { department: ["department_id", "department_name"], assignee: ["assignee_id", "assignee_name"], source: ["source_id", "source_name"], rule: ["rule_id", "rule_name"] } as const;
  const scope = assignmentReportScope(user, programId);
  const department = query.kind === "assignee" && query.departmentIds.length
    ? Prisma.sql`AND e.department_id IN (${Prisma.join(query.departmentIds.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty;
  const projection = query.kind === "campaign" ? Prisma.sql`unnest(e.campaign_ids) AS id` : Prisma.sql`${Prisma.raw(`e.${columns[query.kind][0]}`)} AS id`;
  // Campaign names are read from the snapshot's aligned ID/name arrays (not the mutable campaign).
  const candidates = query.kind === "campaign"
    ? Prisma.sql`SELECT c.id,c.name FROM lead_assignment_report_events e CROSS JOIN LATERAL unnest(e.campaign_ids,e.campaign_names) AS c(id,name) WHERE ${scope}`
    : Prisma.sql`SELECT ${projection},${Prisma.raw(`e.${columns[query.kind][1]}`)} AS name FROM lead_assignment_report_events e WHERE ${scope} ${department}`;
  const items = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT id,MAX(name) AS name FROM (${candidates}) choices WHERE id IS NOT NULL
      AND name ILIKE ${`%${query.search.replace(/[\\%_]/g, "\\$&")}%`}
    GROUP BY id ORDER BY name,id LIMIT 21 OFFSET ${(query.page - 1) * 20}`);
  return { items: items.slice(0, 20), hasMore: items.length > 20 };
}
