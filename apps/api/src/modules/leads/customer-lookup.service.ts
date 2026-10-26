import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../database/prisma";
import { isEnrolledStudent, studentMembershipWhere } from "../students/student-membership";
import { getLeadScopeWhere } from "./lead-list.service";

export const customerLookupPermission = "customer_lookup.view";

export type CustomerLookupQuery = {
  page: number;
  limit: number;
  search?: string;
  type: "all" | "candidates" | "students";
  sourceId?: string;
  assigneeId?: string;
  sortBy: "fullName" | "createdAt" | "updatedAt";
  sortOrder: "asc" | "desc";
  institutionProgramId?: string;
};

const sortFields = {
  fullName: "full_name",
  createdAt: "created_at",
  updatedAt: "updated_at",
} as const;

// Lookup intentionally ignores the user's lead scope: the permission grants system-wide discovery
// of non-sensitive fields only. Phone and email are searchable but never serialized.
export function buildCustomerLookupWhere(query: Omit<CustomerLookupQuery, "page" | "limit" | "sortBy" | "sortOrder">): Prisma.leadsWhereInput {
  const search = query.search?.trim();
  return {
    AND: [
      { deleted_at: null },
      studentMembershipWhere(query.type),
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
      ...(search
        ? [{
            OR: [
              { full_name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { secondary_phones: { has: search } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }]
        : []),
      ...(query.sourceId ? [{ source_id: query.sourceId }] : []),
      ...(query.assigneeId ? [{ assigned_to: query.assigneeId }] : []),
    ],
  };
}

function canViewStudents(user: AuthUser) {
  return user.permissions.some((permission) => ["student.view", "student.view_all"].includes(permission));
}

export async function listCustomerLookup(user: AuthUser, query: CustomerLookupQuery) {
  const where = buildCustomerLookupWhere(query);
  const [items, total] = await prisma.$transaction([
    prisma.leads.findMany({
      where,
      select: {
        id: true,
        full_name: true,
        created_at: true,
        updated_at: true,
        students: { select: { status: true } },
        lead_sources: { select: { id: true, name: true } },
        users_leads_assigned_toTousers: { select: { id: true, full_name: true } },
      },
      orderBy: [{ [sortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.leads.count({ where }),
  ]);

  // Detail pages keep their normal scope rules; lookup only reveals which rows the user may open.
  const openableIds = items.length === 0
    ? new Set<string>()
    : new Set((await prisma.leads.findMany({
        where: {
          AND: [
            { id: { in: items.map((item) => item.id) } },
            getLeadScopeWhere(user, query.institutionProgramId),
          ],
        },
        select: { id: true },
      })).map((lead) => lead.id));
  const studentAccess = canViewStudents(user);

  return {
    data: items.map((lead) => {
      const isStudent = isEnrolledStudent(lead.students);
      return {
        id: lead.id,
        fullName: lead.full_name,
        type: isStudent ? "student" as const : "candidate" as const,
        assignee: lead.users_leads_assigned_toTousers
          ? { id: lead.users_leads_assigned_toTousers.id, fullName: lead.users_leads_assigned_toTousers.full_name }
          : null,
        source: lead.lead_sources ? { id: lead.lead_sources.id, name: lead.lead_sources.name } : null,
        createdAt: lead.created_at?.toISOString() ?? null,
        updatedAt: lead.updated_at?.toISOString() ?? null,
        canOpenDetail: openableIds.has(lead.id) && (!isStudent || studentAccess),
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

export async function getCustomerLookupOptions(institutionProgramId?: string) {
  const leadWhere: Prisma.leadsWhereInput = {
    deleted_at: null,
    ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}),
  };
  const [sources, assignees] = await prisma.$transaction([
    prisma.lead_sources.findMany({
      where: { leads: { some: leadWhere } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.users.findMany({
      where: { deleted_at: null, leads_leads_assigned_toTousers: { some: leadWhere } },
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
    }),
  ]);
  return {
    sources,
    assignees: assignees.map((assignee) => ({ id: assignee.id, fullName: assignee.full_name })),
  };
}
