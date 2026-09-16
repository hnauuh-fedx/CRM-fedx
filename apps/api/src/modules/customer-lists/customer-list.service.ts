import type { Prisma } from "../../generated/prisma/client";

import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere, listLeads, type LeadListQuery } from "../leads/lead-list.service";
import {
  customerListDynamicWhere,
  describeCustomerListFilters,
  hasCustomerListFilters,
  normalizeCustomerListFilterConfig,
  type CustomerListFilterConfig,
} from "./customer-list-filter";

export const customerListViewPermissions = ["customer_list.view_all", "customer_list.manage"] as const;

type CustomerListRecord = {
  id: string;
  institution_program_id: string;
  name: string;
  filter_config: Prisma.JsonValue | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

function membershipWhere(listId: string, filters: CustomerListFilterConfig): Prisma.leadsWhereInput {
  const dynamic = customerListDynamicWhere(filters);
  return {
    OR: [
      ...(dynamic ? [dynamic] : []),
      { customer_list_members: { some: { customer_list_id: listId } } },
    ],
  };
}

function canViewEveryList(user: AuthUser) {
  return user.permissions.includes("customer_list.view_all") || user.permissions.includes("customer_list.manage");
}

function listAccessWhere(user: AuthUser, institutionProgramId: string): Prisma.customer_listsWhereInput {
  return {
    institution_program_id: institutionProgramId,
    deleted_at: null,
    ...(!canViewEveryList(user) ? { created_by: user.id } : {}),
  };
}

async function findAccessibleList(user: AuthUser, id: string, institutionProgramId: string) {
  return prisma.customer_lists.findFirst({
    where: { id, ...listAccessWhere(user, institutionProgramId) },
  });
}

async function serializeList(user: AuthUser, list: CustomerListRecord) {
  const filters = normalizeCustomerListFilterConfig(list.filter_config);
  const leadWhere: Prisma.leadsWhereInput = {
    AND: [
      { deleted_at: null },
      { institution_program_id: list.institution_program_id },
      getLeadScopeWhere(user),
      membershipWhere(list.id, filters),
    ],
  };
  const [customerCount, filterDescription] = await Promise.all([
    prisma.leads.count({ where: leadWhere }),
    describeCustomerListFilters(filters),
  ]);
  return {
    id: list.id,
    name: list.name,
    filters,
    isDynamic: hasCustomerListFilters(filters),
    filterDescription,
    customerCount,
    createdBy: list.created_by,
    createdAt: list.created_at.toISOString(),
    updatedAt: list.updated_at.toISOString(),
  };
}

async function filterReferencesAreVisible(user: AuthUser, config: CustomerListFilterConfig, institutionProgramId: string) {
  if (config.conditions.some((item) => ["phone", "email"].includes(item.field))
    && !user.permissions.includes("lead.sensitive.view")) return false;
  const valuesFor = (field: string) => [...new Set(config.conditions.filter((item) => item.field === field && item.value).map((item) => item.value!))];
  const stageIds = valuesFor("pipelineStageId");
  const sourceIds = valuesFor("sourceId");
  const assigneeIds = valuesFor("assigneeId");
  const majorIds = valuesFor("majorId");
  const leadScope = { deleted_at: null, institution_program_id: institutionProgramId, ...getLeadScopeWhere(user) };
  const [stageCount, sourceCount, assigneeCount, majorCount] = await prisma.$transaction([
    prisma.pipeline_stages.count({ where: { id: { in: stageIds } } }),
    prisma.lead_sources.count({ where: { id: { in: sourceIds }, leads: { some: leadScope } } }),
    prisma.users.count({ where: { id: { in: assigneeIds }, leads_leads_assigned_toTousers: { some: leadScope } } }),
    prisma.majors.count({ where: { id: { in: majorIds }, institution_program_id: institutionProgramId } }),
  ]);
  return stageCount === stageIds.length && sourceCount === sourceIds.length
    && assigneeCount === assigneeIds.length && majorCount === majorIds.length;
}

export async function listCustomerLists(
  user: AuthUser,
  input: { page: number; limit: number; search?: string; institutionProgramId: string },
) {
  const where: Prisma.customer_listsWhereInput = {
    ...listAccessWhere(user, input.institutionProgramId),
    ...(input.search ? { name: { contains: input.search, mode: "insensitive" } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.customer_lists.findMany({
      where,
      orderBy: [{ updated_at: "desc" }, { id: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.customer_lists.count({ where }),
  ]);
  return {
    data: await Promise.all(items.map((item) => serializeList(user, item))),
    capabilities: {
      canManage: user.permissions.includes("customer_list.manage"),
    },
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
}

export async function getCustomerList(user: AuthUser, id: string, institutionProgramId: string) {
  const list = await findAccessibleList(user, id, institutionProgramId);
  return list ? serializeList(user, list) : null;
}

export async function createCustomerList(
  user: AuthUser,
  input: { name: string; filters?: CustomerListFilterConfig; institutionProgramId: string },
  ipAddress?: string,
) {
  const duplicate = await prisma.customer_lists.findFirst({
    where: { institution_program_id: input.institutionProgramId, deleted_at: null, name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) return { ok: false as const, reason: "duplicate_name" as const };
  const filters = normalizeCustomerListFilterConfig(input.filters);
  if (!(await filterReferencesAreVisible(user, filters, input.institutionProgramId))) {
    return { ok: false as const, reason: "invalid_filter" as const };
  }
  const created = await prisma.$transaction(async (tx) => {
    const list = await tx.customer_lists.create({
      data: {
        institution_program_id: input.institutionProgramId,
        name: input.name,
        filter_config: hasCustomerListFilters(filters) ? filters : undefined,
        created_by: user.id,
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "customer_list",
        entity_id: list.id,
        action: "create",
        ip_address: ipAddress,
        new_data: { name: input.name, filters },
      },
    });
    return list;
  });
  return { ok: true as const, data: await serializeList(user, created) };
}

export async function listCustomerListLeads(
  user: AuthUser,
  id: string,
  institutionProgramId: string,
  query: LeadListQuery,
) {
  const list = await findAccessibleList(user, id, institutionProgramId);
  if (!list) return null;
  const filters = normalizeCustomerListFilterConfig(list.filter_config);
  return listLeads(
    user,
    { ...query, institutionProgramId },
    membershipWhere(id, filters),
  );
}

export async function addLeadsToCustomerList(
  user: AuthUser,
  id: string,
  leadIds: string[],
  institutionProgramId: string,
  ipAddress?: string,
) {
  const list = await findAccessibleList(user, id, institutionProgramId);
  if (!list) return { ok: false as const, reason: "not_found" as const };
  const visibleLeads = await prisma.leads.findMany({
    where: {
      id: { in: leadIds },
      deleted_at: null,
      institution_program_id: institutionProgramId,
      ...getLeadScopeWhere(user),
    },
    select: { id: true },
  });
  if (visibleLeads.length !== leadIds.length) return { ok: false as const, reason: "lead_not_found" as const };
  const added = await prisma.$transaction(async (tx) => {
    const result = await tx.customer_list_members.createMany({
      data: leadIds.map((leadId) => ({ customer_list_id: id, lead_id: leadId, added_by: user.id })),
      skipDuplicates: true,
    });
    await tx.customer_lists.update({ where: { id }, data: { updated_at: new Date() } });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "customer_list",
        entity_id: id,
        action: "add_leads",
        ip_address: ipAddress,
        new_data: { leadIds, addedCount: result.count },
      },
    });
    return result.count;
  });
  return { ok: true as const, data: { id, addedCount: added } };
}
