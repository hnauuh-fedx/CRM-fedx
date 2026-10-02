import { Prisma } from "../../generated/prisma/client";

import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getAuthUser } from "../auth/auth.service";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { leadUpdatePermissions } from "../leads/lead-owner-stage-mutations.service";
import { startAutomationExecution } from "./automation-engine.service";
import { validateAutomationGraph } from "./automation-graph.validator";
import { ensureAutomationRuleVersionSnapshot } from "./automation-rule-version.service";
import { SUPPORTED_AUTOMATION_TRIGGER_TYPES } from "./automation.types";
import type { AutomationGraphData } from "./automation.types";
import { getAutomationCustomDataFields } from "./automation-data-field.service";
import { AUTOMATION_REGISTRY } from "./automation-registry";
import { validateAutomationSemantics } from "./automation-semantic.validator";

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

export type AutomationRuleUpdateInput = Partial<AutomationRuleCreateInput>;

async function getAccessibleAutomationProgramIds(user: AuthUser) {
  if (user.accessScope === "ALL" && user.permissions.includes("lead.view_all")) return null;

  const rows = await prisma.leads.findMany({
    where: {
      deleted_at: null,
      institution_program_id: { not: null },
      ...getLeadScopeWhere(user),
    },
    select: { institution_program_id: true },
    distinct: ["institution_program_id"],
  });
  return rows.flatMap((row) => row.institution_program_id ? [row.institution_program_id] : []);
}

function canManageGlobalAutomation(user: AuthUser) {
  return user.accessScope === "ALL" && user.permissions.includes("automation.manage_global");
}

async function getAutomationRuleScopeWhere(user: AuthUser) {
  const accessibleProgramIds = await getAccessibleAutomationProgramIds(user);
  if (accessibleProgramIds === null) {
    return canManageGlobalAutomation(user) ? {} : { institution_program_id: { not: null } };
  }
  return { institution_program_id: { in: accessibleProgramIds } };
}

async function canAccessAutomationProgram(user: AuthUser, institutionProgramId?: string | null) {
  if (!institutionProgramId) return canManageGlobalAutomation(user);
  const accessibleProgramIds = await getAccessibleAutomationProgramIds(user);
  return accessibleProgramIds === null || accessibleProgramIds.includes(institutionProgramId);
}

export async function listAutomationRules(user: AuthUser, query: AutomationRuleListQuery) {
  const accessibleProgramIds = await getAccessibleAutomationProgramIds(user);
  if (query.institutionProgramId && accessibleProgramIds !== null && !accessibleProgramIds.includes(query.institutionProgramId)) {
    return null;
  }

  const where = {
    AND: [
      { archived_at: null },
      ...(accessibleProgramIds === null
        ? (canManageGlobalAutomation(user) ? [] : [{ institution_program_id: { not: null } }])
        : [{ institution_program_id: { in: accessibleProgramIds } }]),
      ...(query.search ? [{
        OR: [
          { name: { contains: query.search, mode: "insensitive" as const } },
          { description: { contains: query.search, mode: "insensitive" as const } },
        ],
      }] : []),
      ...(query.isActive !== undefined ? [{ is_active: query.isActive }] : []),
      ...(query.triggerType ? [{ trigger_type: query.triggerType }] : []),
      ...(query.institutionProgramId ? [{ institution_program_id: query.institutionProgramId }] : []),
    ],
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

export async function getAutomationRule(user: AuthUser, id: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: {
      id: true,
      name: true,
      description: true,
      is_active: true,
      trigger_type: true,
      graph_data: true,
      version: true,
      institution_program_id: true,
      created_by: true,
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
  if (!(await canAccessAutomationProgram(user, input.institutionProgramId))) return null;
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

export async function duplicateAutomationRule(user: AuthUser, id: string, ipAddress?: string) {
  const existing = await prisma.automation_rules.findFirst({
    where: { id, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: {
      id: true,
      name: true,
      description: true,
      trigger_type: true,
      graph_data: true,
      institution_program_id: true,
    },
  });
  if (!existing) return null;

  const duplicated = await prisma.$transaction(async (tx) => {
    const rule = await tx.automation_rules.create({
      data: {
        name: `${existing.name} (Bản sao)`,
        description: existing.description,
        trigger_type: existing.trigger_type,
        graph_data: existing.graph_data === null ? Prisma.JsonNull : existing.graph_data,
        institution_program_id: existing.institution_program_id,
        created_by: user.id,
        is_active: false,
        version: 1,
      },
      select: { id: true, name: true, version: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "automation_rule",
        entity_id: rule.id,
        action: "duplicate",
        old_data: { sourceRuleId: existing.id },
        new_data: { name: rule.name, sourceRuleId: existing.id },
        ip_address: ipAddress,
      },
    });
    return rule;
  });
  return duplicated;
}

export async function updateAutomationRule(user: AuthUser, id: string, input: AutomationRuleUpdateInput) {
  const existing = await prisma.automation_rules.findFirst({
    where: { id, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true, name: true, version: true, is_active: true, institution_program_id: true },
  });
  if (!existing) return null;
  if (input.institutionProgramId !== undefined && !(await canAccessAutomationProgram(user, input.institutionProgramId))) return null;
  if (existing.is_active && (
    input.graphData !== undefined ||
    input.triggerType !== undefined ||
    input.institutionProgramId !== undefined
  )) {
    return { ok: false as const, reason: "rule_is_active" as const };
  }

  const executionConfigChanged = input.graphData !== undefined ||
    input.triggerType !== undefined ||
    input.institutionProgramId !== undefined;

  const updated = await prisma.automation_rules.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.triggerType !== undefined ? { trigger_type: input.triggerType } : {}),
      ...(input.graphData !== undefined ? { graph_data: input.graphData as object } : {}),
      ...(executionConfigChanged ? { version: { increment: 1 } } : {}),
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
  return { ok: true as const, data: updated };
}

export async function archiveAutomationRule(user: AuthUser, id: string, ipAddress?: string) {
  const existing = await prisma.automation_rules.findFirst({
    where: { id, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true, name: true, is_active: true },
  });
  if (!existing) return null;
  if (existing.is_active) return { ok: false as const, reason: "rule_is_active" as const };

  const archivedAt = new Date();
  await prisma.$transaction([
    prisma.automation_rules.update({
      where: { id },
      data: { archived_at: archivedAt, archived_by: user.id, updated_at: archivedAt },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "automation_rule",
        entity_id: id,
        action: "archive",
        ip_address: ipAddress,
        old_data: { name: existing.name },
        new_data: { archivedAt: archivedAt.toISOString(), archivedBy: user.id },
      },
    }),
  ]);
  return { ok: true as const };
}

export async function toggleAutomationRule(user: AuthUser, id: string, isActive: boolean) {
  const existing = await prisma.automation_rules.findFirst({
    where: { id, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: {
      id: true,
      name: true,
      is_active: true,
      trigger_type: true,
      graph_data: true,
      version: true,
      institution_program_id: true,
      created_by: true,
    },
  });
  if (!existing) return null;

  if (isActive) {
    const executionActor = existing.created_by ? await getAuthUser(existing.created_by) : null;
    const validation = await validateRuleConfiguration(
      executionActor,
      existing.trigger_type,
      existing.graph_data,
      existing.institution_program_id,
    );
    if (!validation.valid) {
      const unsupportedTrigger = validation.issues.some((issue) => issue.code === "UNSUPPORTED_TRIGGER");
      return {
        ok: false as const,
        reason: unsupportedTrigger ? "unsupported_trigger" as const : "invalid_graph" as const,
        validation,
      };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (isActive) {
      await ensureAutomationRuleVersionSnapshot({
        ruleId: existing.id,
        version: existing.version,
        triggerType: existing.trigger_type,
        graphData: existing.graph_data as object,
        institutionProgramId: existing.institution_program_id,
        createdBy: existing.created_by,
      }, tx);
    }
    const changedRule = await tx.automation_rules.update({
      where: { id },
      data: { is_active: isActive, updated_at: new Date() },
      select: { id: true, name: true, is_active: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "automation_rule",
        entity_id: id,
        action: isActive ? "activate" : "deactivate",
        old_data: { isActive: existing.is_active },
        new_data: { isActive: changedRule.is_active },
      },
    });
    return changedRule;
  });
  return {
    ok: true as const,
    data: { id: updated.id, name: updated.name, isActive: updated.is_active },
  };
}

export async function validateAutomationRule(user: AuthUser, id: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true, trigger_type: true, graph_data: true, institution_program_id: true, created_by: true },
  });
  if (!rule) return null;
  const executionActor = rule.created_by ? await getAuthUser(rule.created_by) : null;
  return validateRuleConfiguration(executionActor, rule.trigger_type, rule.graph_data, rule.institution_program_id);
}

async function validateRuleConfiguration(
  user: AuthUser | null,
  triggerType: string,
  graphData: unknown,
  institutionProgramId: string | null,
) {
  const graphValidation = validateAutomationGraph(graphData);
  const issues = [...graphValidation.issues];
  if (!SUPPORTED_AUTOMATION_TRIGGER_TYPES.includes(triggerType as typeof SUPPORTED_AUTOMATION_TRIGGER_TYPES[number])) {
    issues.unshift({
      code: "UNSUPPORTED_TRIGGER" as const,
      message: `Sự kiện kích hoạt ${triggerType} chưa có bộ phát sự kiện trong hệ thống.`,
    });
  }

  if (!user) {
    issues.push({
      code: "INSUFFICIENT_PERMISSION" as const,
      message: "Tài khoản thực thi của rule không còn hoạt động.",
    });
  }

  if (graphValidation.valid && user) {
    const options = await getAutomationOptions(user, institutionProgramId ?? undefined);
    if (options) {
      issues.push(...validateAutomationSemantics(graphData as AutomationGraphData, {
        assigneeIds: new Set(options.assignees.map((assignee) => assignee.id)),
        pipelineStageIds: new Set(options.pipelineStages.map((stage) => stage.id)),
        targetRoleCodes: new Set(options.targetRoles.map((role) => role.code)),
        customFieldDataTypes: new Map(options.customDataFields.map((field) => [field.reference, field.dataType])),
        canAssign: user.permissions.includes("lead.assign") || user.permissions.includes("lead.reassign"),
        canUpdateLead: leadUpdatePermissions.some((permission) => user.permissions.includes(permission)),
        canWriteActivity: user.permissions.includes("lead_activity.create")
          || leadUpdatePermissions.some((permission) => user.permissions.includes(permission)),
        canViewSensitiveData: user.permissions.includes("lead.sensitive.view"),
      }));
    } else {
      issues.push({
        code: "INSUFFICIENT_PERMISSION" as const,
        message: "Tài khoản thực thi không còn quyền truy cập chương trình tuyển sinh của rule.",
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export async function listExecutionLogs(user: AuthUser, ruleId: string, page: number, limit: number) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true },
  });
  if (!rule) return null;
  const where = { rule_id: ruleId };
  const [items, total] = await prisma.$transaction([
    prisma.automation_execution_logs.findMany({
      where,
      orderBy: [{ started_at: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        source: true,
        status: true,
        execution_actor_id: true,
        context_data: true,
        error_message: true,
        started_at: true,
        completed_at: true,
        automation_rule_versions: { select: { version: true } },
        users: { select: { id: true, full_name: true } },
        _count: { select: { automation_node_executions: true } },
      },
    }),
    prisma.automation_execution_logs.count({ where }),
  ]);
  return {
    data: items.map((log) => ({
      id: log.id,
      source: log.source,
      status: log.status,
      version: log.automation_rule_versions?.version ?? null,
      requestedBy: log.users ? { id: log.users.id, fullName: log.users.full_name } : null,
      executionActorId: log.execution_actor_id,
      nodeExecutionCount: log._count.automation_node_executions,
      contextData: log.context_data,
      errorMessage: log.error_message,
      startedAt: log.started_at?.toISOString() ?? null,
      completedAt: log.completed_at?.toISOString() ?? null,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getAutomationExecution(user: AuthUser, ruleId: string, executionId: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true },
  });
  if (!rule) return null;
  const log = await prisma.automation_execution_logs.findFirst({
    where: { id: executionId, rule_id: ruleId },
    select: {
      id: true,
      source: true,
      status: true,
      execution_actor_id: true,
      context_data: true,
      error_message: true,
      started_at: true,
      completed_at: true,
      automation_rule_versions: { select: { version: true } },
      automation_node_executions: {
        orderBy: [{ started_at: "asc" }, { id: "asc" }],
        select: {
          id: true,
          node_id: true,
          node_type: true,
          status: true,
          attempt_count: true,
          error_message: true,
          started_at: true,
          completed_at: true,
        },
      },
    },
  });
  if (!log) return null;
  return {
    id: log.id,
    source: log.source,
    status: log.status,
    version: log.automation_rule_versions?.version ?? null,
    executionActorId: log.execution_actor_id,
    contextData: log.context_data,
    errorMessage: log.error_message,
    startedAt: log.started_at?.toISOString() ?? null,
    completedAt: log.completed_at?.toISOString() ?? null,
    nodes: log.automation_node_executions.map((node) => ({
      id: node.id,
      nodeId: node.node_id,
      nodeType: node.node_type,
      status: node.status,
      attemptCount: node.attempt_count,
      errorMessage: node.error_message,
      startedAt: node.started_at?.toISOString() ?? null,
      completedAt: node.completed_at?.toISOString() ?? null,
    })),
  };
}

export async function listAutomationTestLeads(
  user: AuthUser,
  ruleId: string,
  query: { page: number; limit: number; search?: string },
) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: { institution_program_id: true },
  });
  if (!rule) return null;
  const canViewSensitiveData = user.permissions.includes("lead.sensitive.view");
  const where = {
    AND: [
      { deleted_at: null },
      getLeadScopeWhere(user),
      ...(rule.institution_program_id ? [{ institution_program_id: rule.institution_program_id }] : []),
      ...(query.search ? [{
        OR: [
          { full_name: { contains: query.search, mode: "insensitive" as const } },
          { lead_code: { contains: query.search, mode: "insensitive" as const } },
          ...(canViewSensitiveData ? [{ phone: { contains: query.search } }] : []),
        ],
      }] : []),
    ],
  };
  const [items, total] = await prisma.$transaction([
    prisma.leads.findMany({
      where,
      select: { id: true, lead_code: true, full_name: true, phone: true, institution_program_id: true },
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.leads.count({ where }),
  ]);
  return {
    data: items.map((lead) => ({
      id: lead.id,
      leadCode: lead.lead_code,
      fullName: lead.full_name,
      phone: canViewSensitiveData ? lead.phone : null,
      institutionProgramId: lead.institution_program_id,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function runAutomationTest(user: AuthUser, ruleId: string, leadId: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: {
      id: true,
      version: true,
      trigger_type: true,
      graph_data: true,
      institution_program_id: true,
    },
  });
  if (!rule) return { ok: false as const, reason: "rule_not_found" as const };
  const validation = await validateRuleConfiguration(
    user,
    rule.trigger_type,
    rule.graph_data,
    rule.institution_program_id,
  );
  if (!validation.valid) return { ok: false as const, reason: "invalid_rule" as const, validation };

  const lead = await prisma.leads.findFirst({
    where: {
      id: leadId,
      deleted_at: null,
      ...getLeadScopeWhere(user),
      ...(rule.institution_program_id ? { institution_program_id: rule.institution_program_id } : {}),
    },
    select: { id: true, institution_program_id: true },
  });
  if (!lead) return { ok: false as const, reason: "lead_not_found" as const };

  const execution = await startAutomationExecution(
    {
      id: rule.id,
      version: rule.version,
      triggerType: rule.trigger_type,
      graphData: rule.graph_data as unknown as AutomationGraphData,
      institutionProgramId: rule.institution_program_id,
      createdBy: user.id,
    },
    {
      actorId: user.id,
      leadId: lead.id,
      institutionProgramId: lead.institution_program_id ?? undefined,
      payload: { manualTest: true },
    },
    "manual_test",
    user.id,
  );
  return execution;
}

export async function getAutomationOptions(user: AuthUser, institutionProgramId?: string) {
  const accessibleProgramIds = await getAccessibleAutomationProgramIds(user);
  if (institutionProgramId && accessibleProgramIds !== null && !accessibleProgramIds.includes(institutionProgramId)) {
    return null;
  }
  const canAssign = user.permissions.includes("lead.assign") || user.permissions.includes("lead.reassign");
  const scopedLeadWhere = { deleted_at: null, ...getLeadScopeWhere(user) };
  const [programs, assignees, pipelineStages, targetRoles, customDataFields, sources, majors, admissionStatuses, tags] = await Promise.all([
    prisma.institution_programs.findMany({
      where: {
        status: "active",
        ...(accessibleProgramIds === null ? {} : { id: { in: accessibleProgramIds } }),
      },
      select: { id: true, name: true, institutions: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    canAssign && accessibleProgramIds === null
      ? prisma.users.findMany({
          where: { status: "active", deleted_at: null },
          select: { id: true, full_name: true },
          orderBy: { full_name: "asc" },
          take: 500,
        })
      : canAssign && (user.accessScope === "DEPARTMENT" || user.permissions.includes("lead.view_department"))
        ? prisma.users.findMany({
            where: {
              status: "active",
              deleted_at: null,
              user_departments: { some: { department_id: { in: user.departmentIds } } },
            },
            select: { id: true, full_name: true },
            orderBy: { full_name: "asc" },
            take: 500,
          })
        : prisma.users.findMany({
            where: { id: user.id, status: "active", deleted_at: null },
            select: { id: true, full_name: true },
          }),
    prisma.pipeline_stages.findMany({
      select: { id: true, name: true, pipelines: { select: { name: true } } },
      orderBy: [{ pipelines: { name: "asc" } }, { position: "asc" }, { name: "asc" }],
      take: 500,
    }),
    prisma.roles.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    getAutomationCustomDataFields(user, institutionProgramId ?? null),
    prisma.lead_sources.findMany({
      where: {
        ...(institutionProgramId
          ? { OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }] }
          : accessibleProgramIds === null
            ? {}
            : { leads: { some: scopedLeadWhere } }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.majors.findMany({
      where: institutionProgramId
        ? { OR: [{ institution_program_id: institutionProgramId }, { institution_program_id: null }] }
        : accessibleProgramIds === null
          ? undefined
          : { admission_profiles: { some: { leads: { is: scopedLeadWhere } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.admission_statuses.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.tags.findMany({
      where: accessibleProgramIds === null
        ? undefined
        : { entity_tags: { some: { entity_type: "lead", leads: { is: scopedLeadWhere } } } },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);
  return {
    registry: AUTOMATION_REGISTRY,
    institutionPrograms: programs.map((p) => ({ id: p.id, name: p.name, institutionName: p.institutions.name })),
    triggerTypes: [...SUPPORTED_AUTOMATION_TRIGGER_TYPES],
    assignees: assignees.map((assignee) => ({ id: assignee.id, fullName: assignee.full_name })),
    pipelineStages: pipelineStages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      pipelineName: stage.pipelines?.name ?? null,
    })),
    targetRoles,
    customDataFields,
    systemFieldOptions: {
      lead_sources: sources.map((source) => ({ code: source.id, label: source.name })),
      majors: majors.map((major) => ({ code: major.id, label: major.name })),
      admission_statuses: admissionStatuses.map((status) => ({ code: status.id, label: status.name })),
      tags: tags.map((tag) => ({ code: tag.name, label: tag.name })),
      institution_programs: programs.map((program) => ({ code: program.id, label: `${program.institutions.name} - ${program.name}` })),
      "Danh sách cố định": [
        { code: "male", label: "Nam" },
        { code: "female", label: "Nữ" },
        { code: "other", label: "Khác" },
      ],
      "Danh sách trạng thái Telesale": [
        { code: "new", label: "Mới" },
        { code: "contacted", label: "Đã liên hệ" },
        { code: "qualified", label: "Tiềm năng" },
        { code: "converted", label: "Đã chuyển đổi" },
        { code: "lost", label: "Không phù hợp" },
      ],
    },
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
