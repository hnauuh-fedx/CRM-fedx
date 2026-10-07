import { Prisma } from "../../generated/prisma/client";

import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getAuthUser } from "../auth/auth.service";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { leadUpdatePermissions } from "../leads/lead-owner-stage-mutations.service";
import { enqueueAutomationBulkRun, startAutomationExecution } from "./automation-engine.service";
import { validateAutomationGraph, withAutomationTriggerType } from "./automation-graph.validator";
import { ensureAutomationRuleVersionSnapshot } from "./automation-rule-version.service";
import type { AutomationGraphData } from "./automation.types";
import { getAutomationCustomDataFields } from "./automation-data-field.service";
import { AUTOMATION_REGISTRY, AUTOMATION_TRIGGER_TYPES } from "./automation-registry";
import { validateAutomationSemantics } from "./automation-semantic.validator";
import { listAutomationWebhookEndpointOptions } from "./automation-webhook.service";
import {
  listAccessibleAutomationCustomerLists,
  previewAutomationBulkLeads,
  type AutomationBulkFilter,
} from "./automation-bulk.service";
import { redactAutomationText, redactAutomationValue } from "./automation-observability";

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
  if (user.workingInstitutionProgramId !== undefined) {
    return user.workingInstitutionProgramId ? [user.workingInstitutionProgramId] : [];
  }
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

function getAutomationLeadTagScopeSql(user: AuthUser, institutionProgramId?: string) {
  const permissions = new Set(user.permissions);

  if (user.accessScope === "ALL" && permissions.has("lead.view_all")) {
    return Prisma.empty;
  }

  if (user.accessScope === "OWNED_ONLY") {
    return Prisma.sql`AND l.owner_id = ${user.id}::uuid`;
  }

  if (user.accessScope === "DEPARTMENT" || permissions.has("lead.view_department")) {
    if (user.departmentIds.length === 0) return Prisma.sql`AND FALSE`;

    const departmentIds = Prisma.join(
      user.departmentIds.map((departmentId) => Prisma.sql`${departmentId}::uuid`),
    );
    const unassignedProgramScope = institutionProgramId && user.institutionProgramIds.includes(institutionProgramId)
      ? Prisma.sql`
          OR (
            l.institution_program_id = ${institutionProgramId}::uuid
            AND l.assigned_to IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM lead_assignments owner_assignment
              WHERE owner_assignment.lead_id = l.id
                AND owner_assignment.is_main_owner = TRUE
            )
          )
        `
      : Prisma.empty;

    return Prisma.sql`
      AND (
        EXISTS (
          SELECT 1
          FROM lead_assignments department_assignment
          WHERE department_assignment.lead_id = l.id
            AND department_assignment.department_id IN (${departmentIds})
            AND department_assignment.is_main_owner = TRUE
        )
        ${unassignedProgramScope}
      )
    `;
  }

  if (!permissions.has("lead.view_assigned") && permissions.has("lead.view_all")) {
    return Prisma.empty;
  }

  return Prisma.sql`
    AND (
      l.assigned_to = ${user.id}::uuid
      OR EXISTS (
        SELECT 1
        FROM lead_assignments user_assignment
        WHERE user_assignment.lead_id = l.id
          AND user_assignment.assigned_to = ${user.id}::uuid
          AND user_assignment.is_main_owner = TRUE
      )
    )
  `;
}

async function listAccessibleAutomationLeadTags(user: AuthUser, institutionProgramId?: string) {
  if (user.workingInstitutionProgramId !== undefined && !institutionProgramId) return [];

  const programScope = institutionProgramId
    ? Prisma.sql`AND l.institution_program_id = ${institutionProgramId}::uuid`
    : Prisma.empty;
  const leadScope = getAutomationLeadTagScopeSql(user, institutionProgramId);

  return prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
    SELECT DISTINCT t.name
    FROM tags t
    INNER JOIN entity_tags et
      ON et.tag_id = t.id
      AND et.entity_type = 'lead'
    INNER JOIN leads l ON l.id = et.entity_id
    WHERE l.deleted_at IS NULL
      ${programScope}
      ${leadScope}
    ORDER BY t.name ASC
    LIMIT 200
  `);
}

function canManageGlobalAutomation(user: AuthUser) {
  return user.accessScope === "ALL" && user.permissions.includes("automation.manage_global");
}

export async function getAutomationRuleScopeWhere(user: AuthUser) {
  const accessibleProgramIds = await getAccessibleAutomationProgramIds(user);
  if (accessibleProgramIds !== null && accessibleProgramIds.length === 0) {
    return { id: { in: [] as string[] } };
  }
  if (accessibleProgramIds === null) {
    return canManageGlobalAutomation(user) ? {} : { institution_program_id: { not: null } };
  }
  return { institution_program_id: { in: accessibleProgramIds } };
}

export async function canAccessAutomationProgram(user: AuthUser, institutionProgramId?: string | null) {
  if (user.workingInstitutionProgramId !== undefined) {
    return Boolean(institutionProgramId && institutionProgramId === user.workingInstitutionProgramId);
  }
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
  const institutionProgramId = input.institutionProgramId ?? user.workingInstitutionProgramId;
  if (!(await canAccessAutomationProgram(user, institutionProgramId))) return null;
  const rule = await prisma.automation_rules.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      trigger_type: input.triggerType,
      graph_data: (input.graphData as object) ?? { nodes: [], edges: [] },
      is_active: false,
      institution_program_id: institutionProgramId,
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
    const executionActor = existing.created_by
      ? await getAuthUser(existing.created_by, existing.institution_program_id ?? undefined)
      : null;
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
  const executionActor = rule.created_by
    ? await getAuthUser(rule.created_by, rule.institution_program_id ?? undefined)
    : null;
  return validateRuleConfiguration(executionActor, rule.trigger_type, rule.graph_data, rule.institution_program_id);
}

async function validateRuleConfiguration(
  user: AuthUser | null,
  triggerType: string,
  graphData: unknown,
  institutionProgramId: string | null,
) {
  const normalizedGraphData = withAutomationTriggerType(graphData, triggerType);
  const graphValidation = validateAutomationGraph(normalizedGraphData);
  const issues = [...graphValidation.issues];
  if (!AUTOMATION_TRIGGER_TYPES.includes(triggerType as typeof AUTOMATION_TRIGGER_TYPES[number])) {
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
      issues.push(...validateAutomationSemantics(normalizedGraphData, {
        assigneeIds: new Set(options.assignees.map((assignee) => assignee.id)),
        departmentIds: new Set(options.departments.map((department) => department.id)),
        pipelineStageIds: new Set(options.pipelineStages.map((stage) => stage.id)),
        targetRoleCodes: new Set(options.targetRoles.map((role) => role.code)),
        customerListIds: new Set(options.customerLists.map((list) => list.id)),
        webhookEndpointIds: new Set(options.webhookEndpoints.map((endpoint) => endpoint.id)),
        majorIds: new Set(options.majors.map((major) => major.id)),
        admissionStatusIds: new Set(options.admissionStatuses.map((status) => status.id)),
        approvedAdmissionStatusIds: new Set(options.admissionStatuses.filter((status) => status.code === "APPROVED").map((status) => status.id)),
        enrolledAdmissionStatusIds: new Set(options.admissionStatuses.filter((status) => status.code === "ENROLLED").map((status) => status.id)),
        restrictedAdmissionCreationStatusIds: new Set(options.admissionStatuses.filter((status) => status.code === "APPROVED" || status.code === "ENROLLED").map((status) => status.id)),
        admissionClassIds: new Set(options.admissionClasses.map((item) => item.id)),
        customFieldDataTypes: new Map(options.customDataFields.map((field) => [field.reference, field.dataType])),
        canAssign: user.permissions.includes("lead.assign") || user.permissions.includes("lead.reassign"),
        canCreateReminder: user.permissions.includes("reminder.create"),
        canUpdateLead: leadUpdatePermissions.some((permission) => user.permissions.includes(permission)),
        canWriteActivity: user.permissions.includes("lead_activity.create")
          || leadUpdatePermissions.some((permission) => user.permissions.includes(permission)),
        canViewSensitiveData: user.permissions.includes("lead.sensitive.view"),
        canSendMessage: user.permissions.includes("lead.sensitive.view"),
        canCallWebhook: user.permissions.includes("automation.manage"),
        canCreateAdmission: user.permissions.includes("admission.update"),
        canRequestAdmissionDocument: user.permissions.includes("admission_document.upload"),
        canUpdateAdmissionStatus: user.permissions.includes("admission_status.update") || user.permissions.includes("admission.update") || user.permissions.includes("admission.approve"),
        canChangeAdmissionStatus: user.permissions.includes("admission_status.update") || user.permissions.includes("admission.update"),
        canApproveAdmission: user.permissions.includes("admission.approve"),
        canConvertStudent: user.permissions.includes("student.create_from_admission"),
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
  const ruleScope = await getAutomationRuleScopeWhere(user);
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, ...ruleScope },
    select: { id: true },
  });
  if (!rule) return null;
  const where: Prisma.automation_execution_logsWhereInput = {
    rule_id: ruleId,
    OR: [
      { rule_version_id: null },
      { automation_rule_versions: { is: ruleScope as Prisma.automation_rule_versionsWhereInput } },
    ],
  };
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
      contextData: redactAutomationValue(log.context_data),
      errorMessage: redactAutomationText(log.error_message),
      startedAt: log.started_at?.toISOString() ?? null,
      completedAt: log.completed_at?.toISOString() ?? null,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getAutomationExecution(user: AuthUser, ruleId: string, executionId: string) {
  const ruleScope = await getAutomationRuleScopeWhere(user);
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, ...ruleScope },
    select: { id: true },
  });
  if (!rule) return null;
  const log = await prisma.automation_execution_logs.findFirst({
    where: {
      id: executionId,
      rule_id: ruleId,
      OR: [
        { rule_version_id: null },
        { automation_rule_versions: { is: ruleScope as Prisma.automation_rule_versionsWhereInput } },
      ],
    },
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
    contextData: redactAutomationValue(log.context_data),
    errorMessage: redactAutomationText(log.error_message),
    startedAt: log.started_at?.toISOString() ?? null,
    completedAt: log.completed_at?.toISOString() ?? null,
    nodes: log.automation_node_executions.map((node) => ({
      id: node.id,
      nodeId: node.node_id,
      nodeType: node.node_type,
      status: node.status,
      attemptCount: node.attempt_count,
      errorMessage: redactAutomationText(node.error_message),
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

export async function previewAutomationBulkRun(user: AuthUser, ruleId: string, filter: AutomationBulkFilter) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true, institution_program_id: true, graph_data: true },
  });
  if (!rule) return { ok: false as const, reason: "rule_not_found" as const };
  const preview = await previewAutomationBulkLeads(user, rule.institution_program_id, filter);
  if (!preview) return { ok: false as const, reason: "filter_not_found" as const };
  const graph = rule.graph_data as unknown as AutomationGraphData;
  return {
    ok: true as const,
    data: {
      ...preview,
      actions: graph.nodes
        .filter((node) => node.type.startsWith("action_"))
        .map((node) => ({ nodeId: node.id, type: node.type, label: node.data.label })),
    },
  };
}

export async function startAutomationBulkRun(user: AuthUser, ruleId: string, filter: AutomationBulkFilter, idempotencyKey?: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: {
      id: true,
      version: true,
      trigger_type: true,
      graph_data: true,
      institution_program_id: true,
      created_by: true,
    },
  });
  if (!rule) return { ok: false as const, reason: "rule_not_found" as const };
  const validation = await validateRuleConfiguration(user, rule.trigger_type, rule.graph_data, rule.institution_program_id);
  if (!validation.valid) return { ok: false as const, reason: "invalid_rule" as const, validation };
  if (idempotencyKey) {
    const existingJob = await prisma.automation_jobs.findFirst({
      where: { id: idempotencyKey, rule_id: rule.id, requested_by: user.id, type: "automation_bulk_run" },
      select: { id: true, status: true, total_count: true, processed_count: true, failed_count: true, error_message: true, created_at: true, completed_at: true },
    });
    if (existingJob) {
      let resumedJob = existingJob;
      if (existingJob.status === "failed") {
        resumedJob = await prisma.automation_jobs.update({
          where: { id: existingJob.id },
          data: { status: "pending", error_message: null, completed_at: null, updated_at: new Date() },
          select: { id: true, status: true, total_count: true, processed_count: true, failed_count: true, error_message: true, created_at: true, completed_at: true },
        });
      }
      if (resumedJob.status === "pending") {
        try {
          if (!(await enqueueAutomationBulkRun(resumedJob.id))) return { ok: false as const, reason: "queue_unavailable" as const };
        } catch {
          return { ok: false as const, reason: "queue_unavailable" as const };
        }
      }
      return { ok: true as const, data: serializeBulkJob(resumedJob) };
    }
  }
  const snapshotAt = new Date();
  const preview = await previewAutomationBulkLeads(user, rule.institution_program_id, filter, snapshotAt);
  if (!preview) return { ok: false as const, reason: "filter_not_found" as const };
  if (preview.total === 0) return { ok: false as const, reason: "empty_filter" as const };

  const bulkJob = await prisma.$transaction(async (tx) => {
    const job = await tx.automation_jobs.create({
      data: {
        ...(idempotencyKey ? { id: idempotencyKey } : {}),
        type: "automation_bulk_run",
        payload: {
          customerListId: filter.customerListId,
          ruleVersion: rule.version,
          triggerType: rule.trigger_type,
          graphData: rule.graph_data,
          institutionProgramId: rule.institution_program_id,
          snapshotAt: snapshotAt.toISOString(),
          targetSnapshot: preview.targetSnapshot,
        },
        status: "pending",
        requested_by: user.id,
        rule_id: rule.id,
        total_count: preview.total,
        run_at: new Date(),
      },
      select: { id: true, status: true, total_count: true, processed_count: true, failed_count: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "automation_rule",
        entity_id: rule.id,
        action: "bulk_run_started",
        new_data: { bulkJobId: job.id, customerListId: filter.customerListId, total: preview.total },
      },
    });
    return job;
  });
  try {
    if (await enqueueAutomationBulkRun(bulkJob.id)) return { ok: true as const, data: serializeBulkJob(bulkJob) };
  } catch (error) {
    await prisma.automation_jobs.update({
      where: { id: bulkJob.id },
      data: { status: "failed", error_message: error instanceof Error ? error.message : String(error), completed_at: new Date() },
    });
    return { ok: false as const, reason: "queue_unavailable" as const };
  }
  await prisma.automation_jobs.update({
    where: { id: bulkJob.id },
    data: { status: "failed", error_message: "Automation worker hiện không khả dụng.", completed_at: new Date() },
  });
  return { ok: false as const, reason: "queue_unavailable" as const };
}

export async function getAutomationBulkRun(user: AuthUser, ruleId: string, jobId: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, archived_at: null, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true },
  });
  if (!rule) return null;
  const job = await prisma.automation_jobs.findFirst({
    where: { id: jobId, rule_id: ruleId, type: "automation_bulk_run", requested_by: user.id },
    select: {
      id: true,
      status: true,
      total_count: true,
      processed_count: true,
      failed_count: true,
      error_message: true,
      created_at: true,
      completed_at: true,
    },
  });
  return job ? serializeBulkJob(job) : null;
}

export async function getAutomationOptions(user: AuthUser, institutionProgramId?: string) {
  const accessibleProgramIds = await getAccessibleAutomationProgramIds(user);
  if (institutionProgramId && accessibleProgramIds !== null && !accessibleProgramIds.includes(institutionProgramId)) {
    return null;
  }
  const resolvedInstitutionProgramId = institutionProgramId ??
    (accessibleProgramIds?.length === 1 ? accessibleProgramIds[0] : undefined);
  const canAssign = user.permissions.includes("lead.assign") || user.permissions.includes("lead.reassign");
  const scopedLeadWhere = { deleted_at: null, ...getLeadScopeWhere(user) };
  const [programs, assignees, departments, pipelineStages, targetRoles, customDataFields, sources, majors, admissionStatuses, admissionClasses, tags, customerLists, webhookEndpoints] = await Promise.all([
    prisma.institution_programs.findMany({
      where: {
        status: "active",
        ...(accessibleProgramIds === null ? {} : { id: { in: accessibleProgramIds } }),
      },
      select: { id: true, name: true, institution_name: true },
      orderBy: { name: "asc" },
    }),
    canAssign && accessibleProgramIds === null
      ? prisma.users.findMany({
          where: {
            status: "active",
            deleted_at: null,
            ...(resolvedInstitutionProgramId
              ? { user_roles: { some: { roles: { role_institution_programs: { some: { institution_program_id: resolvedInstitutionProgramId } } } } } }
              : {}),
          },
          select: { id: true, full_name: true },
          orderBy: { full_name: "asc" },
          take: 500,
        })
      : canAssign && (user.accessScope === "DEPARTMENT" || user.permissions.includes("lead.view_department"))
        ? prisma.users.findMany({
            where: {
              status: "active",
              deleted_at: null,
              ...(resolvedInstitutionProgramId
                ? { user_roles: { some: { roles: { role_institution_programs: { some: { institution_program_id: resolvedInstitutionProgramId } } } } } }
                : {}),
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
    canAssign
      ? prisma.departments.findMany({
          where: accessibleProgramIds === null ? undefined : { id: { in: user.departmentIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    prisma.pipeline_stages.findMany({
      select: { id: true, name: true, pipelines: { select: { name: true } } },
      orderBy: [{ pipelines: { name: "asc" } }, { position: "asc" }, { name: "asc" }],
      take: 500,
    }),
    prisma.roles.findMany({
      where: resolvedInstitutionProgramId
        ? { role_institution_programs: { some: { institution_program_id: resolvedInstitutionProgramId } } }
        : undefined,
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    getAutomationCustomDataFields(user, resolvedInstitutionProgramId ?? null),
    prisma.lead_sources.findMany({
      where: {
        ...(resolvedInstitutionProgramId
          ? { OR: [{ institution_program_id: resolvedInstitutionProgramId }, { institution_program_id: null }] }
          : accessibleProgramIds === null
            ? {}
            : { leads: { some: scopedLeadWhere } }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.majors.findMany({
      where: resolvedInstitutionProgramId
        ? { OR: [{ institution_program_id: resolvedInstitutionProgramId }, { institution_program_id: null }] }
        : accessibleProgramIds === null
          ? undefined
          : { OR: [{ institution_program_id: { in: accessibleProgramIds } }, { institution_program_id: null }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.admission_statuses.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.student_classes.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    listAccessibleAutomationLeadTags(user, resolvedInstitutionProgramId),
    listAccessibleAutomationCustomerLists(user, resolvedInstitutionProgramId),
    listAutomationWebhookEndpointOptions(user, resolvedInstitutionProgramId),
  ]);
  if (!webhookEndpoints) return null;
  return {
    registry: {
      ...AUTOMATION_REGISTRY,
      nodes: AUTOMATION_REGISTRY.nodes.filter((definition) => (definition.requiredCapabilities ?? []).every((capability) => {
        if (capability === "assign") return canAssign;
        if (capability === "createReminder") return user.permissions.includes("reminder.create");
        if (capability === "updateLead") return leadUpdatePermissions.some((permission) => user.permissions.includes(permission));
        if (capability === "writeActivity") return user.permissions.includes("lead_activity.create") || leadUpdatePermissions.some((permission) => user.permissions.includes(permission));
        if (capability === "sendMessage") return user.permissions.includes("lead.sensitive.view");
        if (capability === "callWebhook") return user.permissions.includes("automation.manage");
        if (capability === "createAdmission") return user.permissions.includes("admission.update");
        if (capability === "requestAdmissionDocument") return user.permissions.includes("admission_document.upload");
        if (capability === "updateAdmissionStatus") return user.permissions.includes("admission_status.update") || user.permissions.includes("admission.update") || user.permissions.includes("admission.approve");
        if (capability === "convertStudent") return user.permissions.includes("student.create_from_admission");
        return false;
      })),
    },
    institutionPrograms: programs.map((p) => ({ id: p.id, name: p.name, institutionName: p.institution_name })),
    triggerTypes: [...AUTOMATION_TRIGGER_TYPES],
    assignees: assignees.map((assignee) => ({ id: assignee.id, fullName: assignee.full_name })),
    departments,
    pipelineStages: pipelineStages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      pipelineName: stage.pipelines?.name ?? null,
    })),
    targetRoles,
    customDataFields,
    customerLists,
    webhookEndpoints,
    majors,
    admissionStatuses,
    admissionClasses,
    systemFieldOptions: {
      lead_sources: sources.map((source) => ({ code: source.id, label: source.name })),
      majors: majors.map((major) => ({ code: major.id, label: major.name })),
      admission_statuses: admissionStatuses.map((status) => ({ code: status.id, label: status.name })),
      tags: tags.map((tag) => ({ code: tag.name, label: tag.name })),
      institution_programs: programs.map((program) => ({ code: program.id, label: `${program.institution_name} - ${program.name}` })),
      payment_statuses: [
        { code: "pending", label: "Chờ thanh toán" },
        { code: "partial", label: "Thanh toán một phần" },
        { code: "paid", label: "Đã thanh toán" },
        { code: "overdue", label: "Quá hạn" },
        { code: "waived", label: "Miễn giảm" },
      ],
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

function serializeBulkJob(job: {
  id: string;
  status: string | null;
  total_count: number;
  processed_count: number;
  failed_count: number;
  error_message?: string | null;
  created_at?: Date | null;
  completed_at?: Date | null;
}) {
  return {
    id: job.id,
    status: job.status ?? "pending",
    totalCount: job.total_count,
    processedCount: job.processed_count,
    failedCount: job.failed_count,
    errorMessage: job.error_message ?? null,
    createdAt: job.created_at?.toISOString() ?? null,
    completedAt: job.completed_at?.toISOString() ?? null,
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
