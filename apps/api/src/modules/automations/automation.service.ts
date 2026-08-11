import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

export type AutomationRuleListQuery = {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  triggerType?: string;
  institutionProgramId?: string;
};

export type AutomationRuleCreateInput = {
  name: string;
  description?: string;
  triggerType: string;
  graphData: unknown;
  institutionProgramId?: string;
};

export type AutomationRuleUpdateInput = Partial<AutomationRuleCreateInput> & {
  isActive?: boolean;
};

export async function listAutomationRules(query: AutomationRuleListQuery) {
  const where = {
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    ...(query.isActive !== undefined ? { is_active: query.isActive } : {}),
    ...(query.triggerType ? { trigger_type: query.triggerType } : {}),
    ...(query.institutionProgramId ? { institution_program_id: query.institutionProgramId } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.automation_rules.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        is_active: true,
        trigger_type: true,
        version: true,
        institution_program_id: true,
        created_at: true,
        updated_at: true,
        users: { select: { id: true, full_name: true } },
        institution_programs: { select: { id: true, name: true } },
        _count: { select: { automation_execution_logs: true } },
      },
      orderBy: [{ updated_at: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.automation_rules.count({ where }),
  ]);

  return {
    data: items.map(serializeRule),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    filters: {
      search: query.search ?? "",
      isActive: query.isActive ?? null,
      triggerType: query.triggerType ?? "",
      institutionProgramId: query.institutionProgramId ?? "",
    },
  };
}

export async function getAutomationRule(id: string) {
  const rule = await prisma.automation_rules.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      is_active: true,
      trigger_type: true,
      graph_data: true,
      version: true,
      institution_program_id: true,
      created_at: true,
      updated_at: true,
      users: { select: { id: true, full_name: true } },
      institution_programs: { select: { id: true, name: true } },
    },
  });
  if (!rule) return null;
  return { ...serializeRule(rule), graphData: rule.graph_data };
}

export async function createAutomationRule(user: AuthUser, input: AutomationRuleCreateInput) {
  const rule = await prisma.automation_rules.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      trigger_type: input.triggerType,
      graph_data: (input.graphData as object) ?? { nodes: [], edges: [] },
      is_active: false,
      institution_program_id: input.institutionProgramId || null,
      created_by: user.id,
    },
    select: { id: true, name: true, version: true, created_at: true },
  });
  await prisma.audit_logs.create({
    data: {
      user_id: user.id,
      entity_type: "automation_rule",
      entity_id: rule.id,
      action: "create",
      new_data: { name: rule.name, triggerType: input.triggerType },
    },
  });
  return rule;
}

export async function updateAutomationRule(user: AuthUser, id: string, input: AutomationRuleUpdateInput) {
  const existing = await prisma.automation_rules.findUnique({ where: { id }, select: { id: true, name: true, version: true } });
  if (!existing) return null;

  const updated = await prisma.automation_rules.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.triggerType !== undefined ? { trigger_type: input.triggerType } : {}),
      ...(input.graphData !== undefined ? { graph_data: input.graphData as object, version: { increment: 1 } } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.institutionProgramId !== undefined ? { institution_program_id: input.institutionProgramId || null } : {}),
      updated_at: new Date(),
    },
    select: { id: true, name: true, is_active: true, version: true, updated_at: true },
  });

  await prisma.audit_logs.create({
    data: {
      user_id: user.id,
      entity_type: "automation_rule",
      entity_id: id,
      action: "update",
      old_data: { name: existing.name, version: existing.version },
      new_data: { name: updated.name, isActive: updated.is_active, version: updated.version },
    },
  });
  return updated;
}

export async function deleteAutomationRule(user: AuthUser, id: string) {
  const existing = await prisma.automation_rules.findUnique({
    where: { id },
    select: { id: true, name: true, is_active: true },
  });
  if (!existing) return null;
  if (existing.is_active) return { ok: false as const, reason: "rule_is_active" as const };

  await prisma.automation_rules.delete({ where: { id } });
  await prisma.audit_logs.create({
    data: {
      user_id: user.id,
      entity_type: "automation_rule",
      entity_id: id,
      action: "delete",
      old_data: { name: existing.name },
    },
  });
  return { ok: true as const };
}

export async function toggleAutomationRule(user: AuthUser, id: string, isActive: boolean) {
  const existing = await prisma.automation_rules.findUnique({ where: { id }, select: { id: true, name: true, is_active: true } });
  if (!existing) return null;

  const updated = await prisma.automation_rules.update({
    where: { id },
    data: { is_active: isActive, updated_at: new Date() },
    select: { id: true, name: true, is_active: true },
  });
  await prisma.audit_logs.create({
    data: {
      user_id: user.id,
      entity_type: "automation_rule",
      entity_id: id,
      action: isActive ? "activate" : "deactivate",
      old_data: { isActive: existing.is_active },
      new_data: { isActive: updated.is_active },
    },
  });
  return updated;
}

export async function listExecutionLogs(ruleId: string, page: number, limit: number) {
  const where = { rule_id: ruleId };
  const [items, total] = await prisma.$transaction([
    prisma.automation_execution_logs.findMany({
      where,
      orderBy: [{ started_at: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        status: true,
        context_data: true,
        error_message: true,
        started_at: true,
        completed_at: true,
      },
    }),
    prisma.automation_execution_logs.count({ where }),
  ]);
  return {
    data: items.map((log) => ({
      id: log.id,
      status: log.status,
      contextData: log.context_data,
      errorMessage: log.error_message,
      startedAt: log.started_at?.toISOString() ?? null,
      completedAt: log.completed_at?.toISOString() ?? null,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getAutomationOptions() {
  const [programs, triggerTypes] = await Promise.all([
    prisma.institution_programs.findMany({
      where: { status: "active" },
      select: { id: true, name: true, institutions: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.automation_rules.findMany({
      select: { trigger_type: true },
      distinct: ["trigger_type"],
      take: 50,
    }),
  ]);
  return {
    institutionPrograms: programs.map((p) => ({ id: p.id, name: p.name, institutionName: p.institutions.name })),
    triggerTypes: triggerTypes.map((r) => r.trigger_type).sort(),
  };
}

function serializeRule(rule: {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  version: number;
  institution_program_id: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  users?: { id: string; full_name: string } | null;
  institution_programs?: { id: string; name: string } | null;
  _count?: { automation_execution_logs: number };
}) {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    isActive: rule.is_active,
    triggerType: rule.trigger_type,
    version: rule.version,
    institutionProgramId: rule.institution_program_id,
    createdAt: rule.created_at?.toISOString() ?? null,
    updatedAt: rule.updated_at?.toISOString() ?? null,
    createdBy: rule.users ? { id: rule.users.id, fullName: rule.users.full_name } : null,
    institutionProgram: rule.institution_programs ?? null,
    executionCount: rule._count?.automation_execution_logs ?? undefined,
  };
}
