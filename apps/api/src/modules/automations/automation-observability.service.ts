import { Prisma } from "../../generated/prisma/client";

import { redisCommandConnection } from "../../config/redis";
import { prisma } from "../../database/prisma";
import { getAuthUser } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import {
  automationQueue,
  reenqueueAutomationExecutionNodes,
  startAutomationExecution,
} from "./automation-engine.service";
import {
  canAccessAutomationProgram,
  getAutomationRuleScopeWhere,
} from "./automation.service";
import {
  automationExecutionStatusWhere,
  classifyAutomationExecution,
  compareAutomationVersions,
  createReplayExecutionId,
  redactAutomationText,
  redactAutomationValue,
  selectRecoverableNodeIds,
} from "./automation-observability";
import type { AutomationContext } from "./automation-execution.types";
import type { AutomationGraphData } from "./automation.types";

const DEFAULT_STUCK_AFTER_MINUTES = 30;

export type AutomationExecutionListQuery = {
  page: number;
  limit: number;
  search?: string;
  ruleId?: string;
  status?: "processing" | "completed" | "failed" | "stuck";
  source?: string;
  from?: Date;
  to?: Date;
};

function executionWhere(
  ruleScope: Prisma.automation_rulesWhereInput,
  query: Omit<AutomationExecutionListQuery, "page" | "limit">,
  now = new Date(),
): Prisma.automation_execution_logsWhereInput {
  const stuckBefore = new Date(now.getTime() - DEFAULT_STUCK_AFTER_MINUTES * 60_000);
  const startedAtUpperBound = query.status === "stuck"
    ? new Date(Math.min(stuckBefore.getTime(), query.to?.getTime() ?? Number.POSITIVE_INFINITY))
    : query.to;
  return {
    AND: [
      {
        automation_rules: {
          ...ruleScope,
          ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
        },
      },
      snapshotScopeWhere(ruleScope),
    ],
    ...(query.ruleId ? { rule_id: query.ruleId } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.status
      ? automationExecutionStatusWhere(query.status, now, DEFAULT_STUCK_AFTER_MINUTES) as Prisma.automation_execution_logsWhereInput
      : {}),
    ...((query.from || startedAtUpperBound) ? {
      started_at: {
        ...(query.from ? { gte: query.from } : {}),
        ...(startedAtUpperBound ? { lte: startedAtUpperBound } : {}),
      },
    } : {}),
  };
}

function snapshotScopeWhere(ruleScope: Prisma.automation_rulesWhereInput): Prisma.automation_execution_logsWhereInput {
  const versionScope = ruleScope as Prisma.automation_rule_versionsWhereInput;
  return {
    OR: [
      { rule_version_id: null },
      { automation_rule_versions: { is: versionScope } },
    ],
  };
}

export async function listAutomationExecutions(user: AuthUser, query: AutomationExecutionListQuery) {
  const now = new Date();
  const where = executionWhere(await getAutomationRuleScopeWhere(user), query, now);
  const [items, total] = await prisma.$transaction([
    prisma.automation_execution_logs.findMany({
      where,
      orderBy: [{ started_at: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        source: true,
        status: true,
        context_data: true,
        error_message: true,
        started_at: true,
        last_progress_at: true,
        next_run_at: true,
        completed_at: true,
        automation_rules: { select: { id: true, name: true } },
        automation_rule_versions: { select: { version: true } },
        _count: { select: { automation_node_executions: true } },
      },
    }),
    prisma.automation_execution_logs.count({ where }),
  ]);

  return {
    data: items.map((item) => ({
      id: item.id,
      rule: item.automation_rules,
      version: item.automation_rule_versions?.version ?? null,
      source: item.source,
      status: classifyAutomationExecution({
        status: item.status,
        lastProgressAt: item.last_progress_at ?? item.started_at ?? now,
        completedAt: item.completed_at,
        nextRunAt: item.next_run_at,
        now,
        stuckAfterMinutes: DEFAULT_STUCK_AFTER_MINUTES,
      }),
      nodeExecutionCount: item._count.automation_node_executions,
      contextData: redactAutomationValue(item.context_data),
      errorMessage: redactAutomationText(item.error_message),
      startedAt: item.started_at?.toISOString() ?? null,
      completedAt: item.completed_at?.toISOString() ?? null,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getAutomationExecutionForOperations(user: AuthUser, executionId: string) {
  const ruleScope = await getAutomationRuleScopeWhere(user);
  const now = new Date();
  const item = await prisma.automation_execution_logs.findFirst({
    where: { id: executionId, AND: [{ automation_rules: ruleScope }, snapshotScopeWhere(ruleScope)] },
    select: {
      id: true,
      source: true,
      status: true,
      context_data: true,
      error_message: true,
      started_at: true,
      last_progress_at: true,
      next_run_at: true,
      completed_at: true,
      automation_rules: { select: { id: true, name: true, created_by: true } },
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
          action_completed_at: true,
          completed_at: true,
        },
      },
    },
  });
  if (!item) return null;

  return {
    id: item.id,
    rule: { id: item.automation_rules.id, name: item.automation_rules.name },
    version: item.automation_rule_versions?.version ?? null,
    source: item.source,
    status: classifyAutomationExecution({
      status: item.status,
      lastProgressAt: item.last_progress_at ?? item.started_at ?? now,
      completedAt: item.completed_at,
      nextRunAt: item.next_run_at,
      now,
      stuckAfterMinutes: DEFAULT_STUCK_AFTER_MINUTES,
    }),
    contextData: redactAutomationValue(item.context_data),
    errorMessage: redactAutomationText(item.error_message),
    startedAt: item.started_at?.toISOString() ?? null,
    completedAt: item.completed_at?.toISOString() ?? null,
    nodes: item.automation_node_executions.map((node) => ({
      id: node.id,
      nodeId: node.node_id,
      nodeType: node.node_type,
      status: node.status,
      attemptCount: node.attempt_count,
      errorMessage: redactAutomationText(node.error_message),
      startedAt: node.started_at?.toISOString() ?? null,
      actionCompletedAt: node.action_completed_at?.toISOString() ?? null,
      completedAt: node.completed_at?.toISOString() ?? null,
    })),
  };
}

export async function getAutomationOperationalMetrics(user: AuthUser, from?: Date, to?: Date) {
  const rangeEnd = to ?? new Date();
  const rangeStart = from ?? new Date(rangeEnd.getTime() - 24 * 60 * 60_000);
  const ruleScope = await getAutomationRuleScopeWhere(user);
  const rules = await prisma.automation_rules.findMany({
    where: ruleScope,
    select: { id: true, name: true },
  });
  const ruleIds = rules.map((rule) => rule.id);
  const accessibleVersions = await prisma.automation_rule_versions.findMany({
    where: { rule_id: { in: ruleIds }, ...(ruleScope as Prisma.automation_rule_versionsWhereInput) },
    select: { id: true },
  });
  const versionIds = accessibleVersions.map((version) => version.id);
  const where: Prisma.automation_execution_logsWhereInput = {
    OR: [
      { rule_version_id: { in: versionIds } },
      { rule_version_id: null, rule_id: { in: ruleIds } },
    ],
    started_at: { gte: rangeStart, lte: rangeEnd },
  };
  const stuckBefore = new Date(rangeEnd.getTime() - DEFAULT_STUCK_AFTER_MINUTES * 60_000);

  const [statusGroups, ruleGroups, stuckCount] = await Promise.all([
    prisma.automation_execution_logs.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.automation_execution_logs.groupBy({
      by: ["rule_id", "status"],
      where,
      _count: { _all: true },
    }),
    prisma.automation_execution_logs.count({
      where: {
        ...where,
        status: "processing",
        completed_at: null,
        last_progress_at: { lte: stuckBefore },
        OR: [{ next_run_at: null }, { next_run_at: { lte: rangeEnd } }],
      },
    }),
  ]);

  const statusCounts = new Map(statusGroups.map((group) => [group.status, group._count._all]));
  const total = statusGroups.reduce((sum, group) => sum + group._count._all, 0);
  const completed = statusCounts.get("completed") ?? 0;
  const failed = statusCounts.get("failed") ?? 0;
  let averageLatencyMs: number | null = null;
  let affectedEntities = 0;
  let businessCountsByRule = new Map<string, { affectedLeads: number; affectedAdmissions: number; affectedStudents: number }>();
  if (ruleIds.length > 0) {
    const idList = Prisma.join(ruleIds.map((id) => Prisma.sql`${id}::uuid`));
    const accessPredicate = versionIds.length > 0
      ? Prisma.sql`((rule_version_id IS NULL AND rule_id IN (${idList})) OR rule_version_id IN (${Prisma.join(versionIds.map((id) => Prisma.sql`${id}::uuid`))}))`
      : Prisma.sql`(rule_version_id IS NULL AND rule_id IN (${idList}))`;
    const [[latency], businessCounts] = await Promise.all([
      prisma.$queryRaw<Array<{ average_ms: number | null; affected_entities: bigint }>>(Prisma.sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::float8 AS average_ms,
          COUNT(DISTINCT COALESCE(
            context_data->>'leadId',
            context_data->>'admissionProfileId',
            context_data->>'studentId'
          ))::bigint AS affected_entities
        FROM automation_execution_logs
        WHERE ${accessPredicate}
          AND started_at >= ${rangeStart}
          AND started_at <= ${rangeEnd}
      `),
      prisma.$queryRaw<Array<{ rule_id: string; affected_leads: bigint; affected_admissions: bigint; affected_students: bigint }>>(Prisma.sql`
        SELECT
          rule_id,
          COUNT(DISTINCT context_data->>'leadId')::bigint AS affected_leads,
          COUNT(DISTINCT context_data->>'admissionProfileId')::bigint AS affected_admissions,
          COUNT(DISTINCT context_data->>'studentId')::bigint AS affected_students
        FROM automation_execution_logs
        WHERE ${accessPredicate}
          AND started_at >= ${rangeStart}
          AND started_at <= ${rangeEnd}
        GROUP BY rule_id
      `),
    ]);
    averageLatencyMs = latency?.average_ms ?? null;
    affectedEntities = Number(latency?.affected_entities ?? 0);
    businessCountsByRule = new Map(businessCounts.map((row) => [row.rule_id, {
      affectedLeads: Number(row.affected_leads),
      affectedAdmissions: Number(row.affected_admissions),
      affectedStudents: Number(row.affected_students),
    }]));
  }

  const groupsByRule = new Map<string, typeof ruleGroups>();
  for (const group of ruleGroups) {
    const groups = groupsByRule.get(group.rule_id) ?? [];
    groups.push(group);
    groupsByRule.set(group.rule_id, groups);
  }
  const perRule = rules.map((rule) => {
    const groups = groupsByRule.get(rule.id) ?? [];
    const ruleTotal = groups.reduce((sum, group) => sum + group._count._all, 0);
    const ruleCompleted = groups.find((group) => group.status === "completed")?._count._all ?? 0;
    const ruleFailed = groups.find((group) => group.status === "failed")?._count._all ?? 0;
    const businessCounts = businessCountsByRule.get(rule.id) ?? { affectedLeads: 0, affectedAdmissions: 0, affectedStudents: 0 };
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      total: ruleTotal,
      completed: ruleCompleted,
      failed: ruleFailed,
      successRate: ruleTotal > 0 ? ruleCompleted / ruleTotal : 0,
      ...businessCounts,
    };
  }).filter((rule) => rule.total > 0).sort((a, b) => b.total - a.total);

  const queue = await getAutomationQueueHealth();

  return {
    range: { from: rangeStart.toISOString(), to: rangeEnd.toISOString() },
    totals: {
      executions: total,
      completed,
      failed,
      processing: statusCounts.get("processing") ?? 0,
      stuck: stuckCount,
      affectedEntities,
      successRate: total > 0 ? completed / total : 0,
      failureRate: total > 0 ? failed / total : 0,
      averageLatencyMs,
      throughputPerHour: total / Math.max(1, (rangeEnd.getTime() - rangeStart.getTime()) / 3_600_000),
    },
    queue,
    perRule,
  };
}

async function findRecoverableExecution(user: AuthUser, executionId: string) {
  const ruleScope = await getAutomationRuleScopeWhere(user);
  return prisma.automation_execution_logs.findFirst({
    where: { id: executionId, AND: [{ automation_rules: ruleScope }, snapshotScopeWhere(ruleScope)] },
    select: {
      id: true,
      status: true,
      context_data: true,
      execution_actor_id: true,
      last_progress_at: true,
      next_run_at: true,
      rule_id: true,
      automation_rules: { select: { name: true, graph_data: true, trigger_type: true, version: true, institution_program_id: true, created_by: true } },
      automation_rule_versions: { select: { graph_data: true, trigger_type: true, version: true, institution_program_id: true, created_by: true } },
      automation_node_executions: { select: { node_id: true, status: true, next_source_handle: true } },
    },
  });
}

export async function retryAutomationExecution(user: AuthUser, executionId: string, ipAddress?: string) {
  const execution = await findRecoverableExecution(user, executionId);
  if (!execution) return { ok: false as const, reason: "not_found" as const };
  if (!execution.context_data) return { ok: false as const, reason: "context_expired" as const };
  const snapshotProgramId = execution.automation_rule_versions?.institution_program_id
    ?? execution.automation_rules.institution_program_id;
  if (!(await canAccessAutomationProgram(user, snapshotProgramId))) {
    return { ok: false as const, reason: "scope_denied" as const };
  }
  const now = new Date();
  const stuckBefore = new Date(now.getTime() - DEFAULT_STUCK_AFTER_MINUTES * 60_000);
  const isStuck = execution.status === "processing"
    && (execution.last_progress_at?.getTime() ?? 0) <= stuckBefore.getTime()
    && (!execution.next_run_at || execution.next_run_at <= now);
  if (execution.status !== "failed" && !isStuck) {
    return { ok: false as const, reason: "not_recoverable" as const };
  }
  const graph = (execution.automation_rule_versions?.graph_data ?? execution.automation_rules.graph_data) as unknown as AutomationGraphData;
  const trigger = graph.nodes.find((node) => node.type === "trigger");
  const entryNodeIds = trigger ? graph.edges.filter((edge) => edge.source === trigger.id).map((edge) => edge.target) : [];
  const nodeIds = selectRecoverableNodeIds(
    execution.automation_node_executions.map((node) => ({ nodeId: node.node_id, status: node.status, nextSourceHandle: node.next_source_handle })),
    entryNodeIds,
    graph.edges,
  );
  if (nodeIds.length === 0) return { ok: false as const, reason: "nothing_to_retry" as const };
  const context = (execution.context_data ?? {}) as unknown as AutomationContext;
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.automation_execution_logs.updateMany({
      where: {
        id: execution.id,
        ...(execution.status === "failed"
          ? { status: "failed" }
          : automationExecutionStatusWhere("stuck", now, DEFAULT_STUCK_AFTER_MINUTES)),
      },
      data: { status: "processing", error_message: null, completed_at: null, last_progress_at: now, next_run_at: null },
    });
    if (claim.count > 0) {
      await tx.audit_logs.create({
        data: {
          user_id: user.id,
          entity_type: "automation_execution",
          entity_id: execution.id,
          action: "retry",
          ip_address: ipAddress,
          new_data: { ruleId: execution.rule_id, requestedNodeIds: nodeIds },
        },
      });
    }
    return claim;
  });
  if (claimed.count === 0) return { ok: false as const, reason: "already_recovered" as const };
  let result: Awaited<ReturnType<typeof reenqueueAutomationExecutionNodes>>;
  try {
    result = await reenqueueAutomationExecutionNodes({ context, graph, logId: execution.id }, nodeIds);
    if (!result.ok) throw new Error(result.reason);
  } catch (error) {
    await prisma.automation_execution_logs.updateMany({
      where: { id: execution.id, status: "processing", last_progress_at: now },
      data: { status: "failed", error_message: "Không thể đưa execution trở lại hàng đợi.", completed_at: new Date() },
    });
    if (error instanceof Error && error.message === "queue_unavailable") {
      return { ok: false as const, reason: "queue_unavailable" as const };
    }
    throw error;
  }
  return { ok: true as const, data: { executionId: execution.id, ...result } };
}

export async function replayAutomationExecution(user: AuthUser, executionId: string, requestId: string, ipAddress?: string) {
  const execution = await findRecoverableExecution(user, executionId);
  if (!execution) return { ok: false as const, reason: "not_found" as const };
  if (!execution.context_data) return { ok: false as const, reason: "context_expired" as const };
  const version = execution.automation_rule_versions;
  const snapshotProgramId = version?.institution_program_id ?? execution.automation_rules.institution_program_id;
  if (!(await canAccessAutomationProgram(user, snapshotProgramId))) {
    return { ok: false as const, reason: "scope_denied" as const };
  }
  const graph = (version?.graph_data ?? execution.automation_rules.graph_data) as unknown as AutomationGraphData;
  const storedContext = (execution.context_data ?? {}) as unknown as AutomationContext;
  const { ruleId: _ruleId, ...context } = storedContext;
  const result = await startAutomationExecution({
    id: execution.rule_id,
    version: version?.version ?? execution.automation_rules.version,
    triggerType: version?.trigger_type ?? execution.automation_rules.trigger_type,
    graphData: graph,
    institutionProgramId: snapshotProgramId,
    createdBy: execution.execution_actor_id ?? storedContext.actorId ?? user.id,
  }, context, "replay", user.id, undefined, createReplayExecutionId(execution.id, requestId), false, {
    userId: user.id,
    action: "replay",
    ipAddress,
    newData: { replayOfExecutionId: execution.id, ruleId: execution.rule_id, requestId },
  });
  if (!result.ok) return result;
  return result;
}

export async function listAutomationRuleVersions(user: AuthUser, ruleId: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true, version: true },
  });
  if (!rule) return null;
  const versions = await prisma.automation_rule_versions.findMany({
    where: { rule_id: ruleId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, trigger_type: true, graph_data: true, created_at: true, users: { select: { id: true, full_name: true } } },
  });
  return versions.map((version, index) => {
    const previous = versions[index + 1];
    return {
      id: version.id,
      version: version.version,
      triggerType: version.trigger_type,
      createdAt: version.created_at?.toISOString() ?? null,
      createdBy: version.users ? { id: version.users.id, fullName: version.users.full_name } : null,
      isCurrent: version.version === rule.version,
      changes: previous
        ? compareAutomationVersions(previous.graph_data as unknown as AutomationGraphData, version.graph_data as unknown as AutomationGraphData)
        : null,
    };
  });
}

export async function rollbackAutomationRule(user: AuthUser, ruleId: string, versionId: string, ipAddress?: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true, version: true, is_active: true, graph_data: true, trigger_type: true, institution_program_id: true },
  });
  if (!rule) return { ok: false as const, reason: "not_found" as const };
  if (rule.is_active) return { ok: false as const, reason: "rule_active" as const };
  const target = await prisma.automation_rule_versions.findFirst({ where: { id: versionId, rule_id: ruleId } });
  if (!target) return { ok: false as const, reason: "version_not_found" as const };
  if (!(await canAccessAutomationProgram(user, target.institution_program_id))) {
    return { ok: false as const, reason: "scope_denied" as const };
  }
  const newVersion = rule.version + 1;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.automation_rules.update({
      where: { id: ruleId },
      data: {
        graph_data: target.graph_data as Prisma.InputJsonValue,
        trigger_type: target.trigger_type,
        institution_program_id: target.institution_program_id,
        version: newVersion,
        updated_at: new Date(),
      },
      select: { id: true, name: true, version: true },
    });
    await tx.automation_rule_versions.create({
      data: {
        rule_id: ruleId,
        version: newVersion,
        graph_data: target.graph_data as Prisma.InputJsonValue,
        trigger_type: target.trigger_type,
        institution_program_id: target.institution_program_id,
        created_by: user.id,
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "automation_rule",
        entity_id: ruleId,
        action: "rollback",
        ip_address: ipAddress,
        old_data: { version: rule.version },
        new_data: { version: newVersion, restoredVersion: target.version },
      },
    });
    return result;
  });
  return { ok: true as const, data: updated };
}

export async function transferAutomationRuleOwner(user: AuthUser, ruleId: string, ownerId: string, ipAddress?: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, ...(await getAutomationRuleScopeWhere(user)) },
    select: { id: true, created_by: true, institution_program_id: true },
  });
  if (!rule) return { ok: false as const, reason: "not_found" as const };
  const owner = await getAuthUser(ownerId);
  if (!owner || !owner.permissions.includes("automation.manage")) {
    return { ok: false as const, reason: "invalid_owner" as const };
  }
  if (!(await canAccessAutomationProgram(owner, rule.institution_program_id))) {
    return { ok: false as const, reason: "owner_scope_denied" as const };
  }
  await prisma.$transaction([
    prisma.automation_rules.update({ where: { id: ruleId }, data: { created_by: ownerId, updated_at: new Date() } }),
    prisma.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "automation_rule",
        entity_id: ruleId,
        action: "transfer_owner",
        ip_address: ipAddress,
        old_data: { ownerId: rule.created_by },
        new_data: { ownerId },
      },
    }),
  ]);
  return { ok: true as const, data: { id: ruleId, owner: { id: owner.id, fullName: owner.fullName } } };
}

export async function listAutomationOwnerCandidates(user: AuthUser, ruleId: string, search?: string) {
  const rule = await prisma.automation_rules.findFirst({
    where: { id: ruleId, ...(await getAutomationRuleScopeWhere(user)) },
    select: { institution_program_id: true },
  });
  if (!rule) return null;
  const candidates = await prisma.users.findMany({
    where: {
      deleted_at: null,
      status: "active",
      ...(search ? {
        OR: [
          { full_name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      } : {}),
      user_roles: {
        some: {
          roles: {
            role_permissions: {
              some: { permissions: { code: "automation.manage", is_active: true } },
            },
          },
        },
      },
    },
    orderBy: [{ full_name: "asc" }, { id: "asc" }],
    take: 50,
    select: { id: true },
  });
  const eligible: AuthUser[] = [];
  for (let index = 0; index < candidates.length; index += 5) {
    const principals = (await Promise.all(candidates.slice(index, index + 5).map((candidate) => getAuthUser(candidate.id))))
      .filter((principal): principal is AuthUser => Boolean(principal));
    const checks = await Promise.all(principals.map(async (principal) => ({
      principal,
      allowed: await canAccessAutomationProgram(principal, rule.institution_program_id),
    })));
    eligible.push(...checks.filter((item) => item.allowed).map((item) => item.principal));
  }
  return eligible.map((principal) => ({ id: principal.id, fullName: principal.fullName }));
}

export async function listAutomationTransferRules(user: AuthUser, search?: string) {
  return prisma.automation_rules.findMany({
    where: {
      archived_at: null,
      ...(await getAutomationRuleScopeWhere(user)),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      users: { select: { id: true, full_name: true } },
    },
  }).then((rules) => rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    owner: rule.users ? { id: rule.users.id, fullName: rule.users.full_name } : null,
  })));
}

async function getAutomationQueueHealth() {
  const unavailable = { available: false as const, waiting: 0, active: 0, delayed: 0, failed: 0, paused: 0 };
  if (!automationQueue || !redisCommandConnection) return unavailable;
  try {
    await redisCommandConnection.ping();
    return {
      available: true as const,
      ...(await automationQueue.getJobCounts("waiting", "active", "delayed", "failed", "paused")),
    };
  } catch {
    return unavailable;
  }
}
