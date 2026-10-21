import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AutomationGraphData, AutomationNode } from "../modules/automations/automation.types";
import type { AutomationReassignmentPolicy } from "@admission-crm/shared/automation-reassignment-policy";

async function main() {
  process.env.NODE_ENV = "integration";
  process.env.AUTOMATION_QUEUE_NAME = `manual_unassignment_${randomUUID().slice(0, 8)}`;
  process.env.AUTOMATION_DELAY_MS_PER_MINUTE = "100";
  process.env.AUTOMATION_PROCESS_ROLE = "all";
  delete process.env.DISABLE_REDIS;
  delete process.env.DISABLE_AUTOMATION_WORKER;
  const { env } = await import("../config/env.js");
  assert.match(new URL(env.DATABASE_URL).pathname, /^\/crm_manual_unassign_test_\d+$/, "Use the isolated test runner, never a business database.");
  const { prisma } = await import("../database/prisma.js");
  const engine = await import("../modules/automations/automation-engine.service.js");
  const { redisConnection, redisCommandConnection } = await import("../config/redis.js");
  const { updateLead } = await import("../modules/leads/application/update-lead.use-case.js");
  const { assignVisibleLead } = await import("../modules/leads/application/lead-owner-stage.use-cases.js");
  const { assignLeads } = await import("../modules/leads/application/assign-leads.use-case.js");
  const events = await import("../modules/automations/manual-unassignment-event.service.js");
  const { executeRegisteredAutomationNode } = await import("../modules/automations/automation-action-registry.js");
  const { getAuthUser } = await import("../modules/auth/auth.service.js");
  const { initializeLeadOnOpen } = await import("../modules/leads/application/open-lead.use-case.js");
  const { processReassignmentExpiry, processReassignmentWarning } = await import("../modules/automations/automation-reassignment.service.js");
  assert.ok(engine.automationQueue && redisConnection);
  await redisConnection.ping();
  await engine.automationQueue.pause();
  const queue = engine.automationQueue;
  const runId = randomUUID().slice(0, 8);
  const policy: AutomationReassignmentPolicy = {
    enabled: true, interactionCriterion: "not_opened_since_assignment", timeoutMinutes: 60,
    assignToAnotherSale: true, excludeCurrentAssignee: true, maxReassignments: 3,
    recyclePool: false, maxPoolCycles: 1, warningEnabled: true, warningBeforeMinutes: 30,
    warningContent: "Vui lòng mở Lead.", notifyOnRemoval: true,
  };
  async function until<T>(read: () => Promise<T>, valid: (value: T) => boolean) {
    const deadline = Date.now() + 15_000;
    do {
      const value = await read();
      if (valid(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } while (Date.now() < deadline);
    throw new Error("Timed out waiting for integration checkpoint");
  }
  try {
    const program = await prisma.institution_programs.findFirstOrThrow({ orderBy: { code: "asc" } });
    const otherProgram = await prisma.institution_programs.findFirstOrThrow({ where: { id: { not: program.id } } });
    const source = await prisma.lead_sources.create({ data: { name: `Manual ${runId}`, institution_program_id: program.id } });
    const dept = await prisma.departments.create({ data: { name: `Manual ${runId}` } });
    const managerRole = await prisma.roles.create({ data: { code: `MU_MANAGER_${runId}`, name: "Test manager" } });
    const saleRole = await prisma.roles.create({ data: { code: `MU_SALE_${runId}`, name: "Test Sale" } });
    const permissions = await prisma.permissions.findMany();
    await prisma.role_permissions.createMany({ data: permissions.filter((p) => ["lead.assign", "lead.reassign", "lead.update_all", "lead.view_all", "automation.manage"].includes(p.code)).map((p) => ({ role_id: managerRole.id, permission_id: p.id })) });
    await prisma.role_permissions.create({ data: { role_id: saleRole.id, permission_id: permissions.find((p) => p.code === "lead.view_assigned")!.id } });
    await prisma.role_access_scopes.createMany({ data: [{ role_id: managerRole.id, scope_code: "ALL" }, { role_id: saleRole.id, scope_code: "ASSIGNED_ONLY" }] });
    await prisma.role_institution_programs.createMany({ data: [managerRole.id, saleRole.id].map((role_id) => ({ role_id, institution_program_id: program.id })) });
    const users = await Promise.all(["manager", "sale-a", "sale-b", "sale-c"].map((suffix) => prisma.users.create({ data: {
      email: `manual-${runId}-${suffix}@example.test`, full_name: suffix, password_hash: "test-only",
    } })));
    const [manager, a, b, c] = users;
    await prisma.user_roles.createMany({ data: users.map((user, i) => ({ user_id: user.id, role_id: i === 0 ? managerRole.id : saleRole.id })) });
    await prisma.user_departments.createMany({ data: users.map((user) => ({ user_id: user.id, department_id: dept.id })) });
    const actor = await getAuthUser(manager.id, program.id);
    assert.ok(actor);
    const pool: AutomationNode = { id: "pool", type: "action_assign_pool", position: { x: 0, y: 100 }, data: {
      label: "Chia lại", assignmentStrategy: "round_robin", assigneeIds: [a.id, b.id, c.id], reassignmentPolicy: policy,
    } };
    const graph: AutomationGraphData = { nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Bỏ Sale", triggerType: "lead_unassigned" } }, pool,
    ], edges: [{ id: "edge", source: "trigger", target: "pool" }] };
    const makeRule = (name: string, extra = {}) => prisma.automation_rules.create({ data: {
      name: `Manual ${runId} ${name}`, trigger_type: "lead_unassigned", graph_data: graph as any,
      institution_program_id: program.id, created_by: manager.id, is_active: false, ...extra,
    } });
    const rule = await makeRule("main");
    const secondRule = await makeRule("second");
    let sequence = 0;
    const makeLead = async () => {
      const lead = await prisma.leads.create({ data: {
        full_name: `Manual lead ${runId} ${++sequence}`, phone: `09${runId}${sequence}`, source_id: source.id,
        institution_program_id: program.id, owner_id: manager.id,
      } });
      assert.ok((await assignVisibleLead(actor, lead.id, { assigneeId: a.id }, program.id)).ok);
      return lead;
    };
    const save = (lead: Awaited<ReturnType<typeof makeLead>>, assigneeId: string | null, overrides = {}) => updateLead(actor, lead.id, {
      fullName: lead.full_name, phone: lead.phone, sourceId: source.id, institutionProgramId: program.id, assigneeId, ...overrides,
    }, program.id);
    const unassign = async (lead: Awaited<ReturnType<typeof makeLead>>) => {
      const result = await save(lead, null);
      assert.ok(result.ok && result.data.manualUnassignmentEventId);
      const id = result.data.manualUnassignmentEventId;
      await until(() => prisma.automation_jobs.findUniqueOrThrow({ where: { id } }), (job) => job.status === "completed" || job.status === "failed");
      return id;
    };
    const owner = async (leadId: string) => (await prisma.leads.findUniqueOrThrow({ where: { id: leadId } })).assigned_to;
    const cursor = async (ruleId = rule.id) => (await prisma.automation_assignment_cursors.findUnique({ where: { rule_id_node_id: { rule_id: ruleId, node_id: pool.id } } }))?.last_assignee_id;
    const count = (leadId: string) => prisma.lead_assignments.count({ where: { lead_id: leadId } });
    const action = async (leadId: string, eventId: string, ruleId = rule.id, node = pool) => {
      const log = await prisma.automation_execution_logs.create({ data: { rule_id: ruleId, status: "processing", execution_actor_id: manager.id } });
      const execution = await prisma.automation_node_executions.create({ data: { execution_log_id: log.id, node_id: node.id, node_type: node.type } });
      await executeRegisteredAutomationNode(node, { ruleId, actorId: manager.id, leadId, institutionProgramId: program.id, manualUnassignmentEventId: eventId }, execution.id);
      return execution.id;
    };
    const monitor = (leadId: string) => prisma.automation_reassignment_monitors.findFirstOrThrow({ where: { lead_id: leadId }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
    const marks: string[] = [];

    // T01, T04, T06: actual Redis worker, persisted event context and ACK-loss replay.
    await prisma.automation_rules.update({ where: { id: rule.id }, data: { is_active: true } });
    const first = await makeLead();
    const firstEvent = await unassign(first);
    await queue.resume();
    await until(() => owner(first.id), (id) => id !== null);
    await until(() => prisma.automation_execution_logs.findMany({ where: { rule_id: rule.id } }), (logs) => logs.every((l) => l.status === "completed"));
    await queue.pause();
    const firstMonitor = await monitor(first.id);
    assert.equal(await owner(first.id), a.id);
    assert.equal(firstMonitor.reassignment_count, 0);
    assert.equal(firstMonitor.pool_cycle, 0);
    assert.equal(await prisma.notifications.count({ where: { user_id: a.id, type: "lead_assignment", content: { contains: first.full_name } } }), 2);
    assert.equal(await prisma.audit_logs.count({ where: { entity_id: first.id, action: "automation_assignment_completed" } }), 1);
    const beforeReplay = await count(first.id);
    const { automationEventExecutionId } = await import("../modules/automations/automation-event-id.js");
    const replay = await engine.startAutomationExecution({ id: rule.id, version: rule.version, triggerType: rule.trigger_type, graphData: graph, institutionProgramId: program.id, createdBy: manager.id }, {
      actorId: manager.id, leadId: first.id, institutionProgramId: program.id, manualUnassignmentEventId: firstEvent,
    }, "event", manager.id, undefined, automationEventExecutionId(firstEvent, rule.id), true);
    assert.ok(replay.ok && !replay.data.created);
    assert.equal(await count(first.id), beforeReplay);
    assert.equal(await cursor(), a.id);
    const second = await makeLead();
    await unassign(second);
    await queue.resume();
    await until(() => owner(second.id), (id) => id !== null);
    await until(() => prisma.automation_execution_logs.findMany({ where: { rule_id: rule.id } }), (logs) => logs.every((l) => l.status === "completed"));
    await queue.pause();
    assert.equal(await owner(second.id), b.id);
    assert.equal(await cursor(), b.id);
    await prisma.automation_rules.update({ where: { id: rule.id }, data: { is_active: false } });
    marks.push("T01 T04 T06: worker assignment, monitor, history, round-robin and completed-event replay");

    // T02: unchanged empty, direct replacement, validation failure and transaction rollback.
    const empty = await makeLead();
    await unassign(empty);
    const eventCount = await prisma.automation_jobs.count({ where: { type: "manual_lead_unassignment" } });
    assert.ok((await save(empty, null)).ok);
    assert.equal(await prisma.automation_jobs.count({ where: { type: "manual_lead_unassignment" } }), eventCount);
    assert.ok((await save(empty, b.id)).ok);
    assert.equal(await prisma.automation_jobs.count({ where: { type: "manual_lead_unassignment" } }), eventCount);
    assert.equal((await save(empty, null, { sourceId: randomUUID() })).ok, false);
    await assert.rejects(prisma.$transaction(async (tx) => {
      await events.createManualUnassignmentEvent(tx, { leadId: empty.id, actorId: actor.id, institutionProgramId: program.id });
      throw new Error("rollback fixture");
    }), /rollback fixture/);
    assert.equal(await prisma.automation_jobs.count({ where: { type: "manual_lead_unassignment" } }), eventCount);
    assert.equal(await owner(empty.id), b.id);
    marks.push("T02: no duplicate events; direct replacement; rejected write and rollback");

    // T03: actual engine selection, including archived/other-program and no manual source.
    await makeRule("archived", { is_active: true, archived_at: new Date() });
    await makeRule("other-program", { is_active: true, institution_program_id: otherProgram.id });
    const noRule = await makeLead();
    const noRuleEvent = await unassign(noRule);
    assert.equal(await owner(noRule.id), null);
    const selected = await engine.triggerAutomation("lead_unassigned", { leadId: noRule.id, actorId: actor.id, institutionProgramId: program.id, manualUnassignmentEventId: noRuleEvent });
    assert.equal(selected.matched, 0);
    assert.equal((await engine.triggerAutomation("lead_unassigned", { leadId: noRule.id, actorId: actor.id })).matched, 0);
    marks.push("T03: disabled/archived/other-program rules and absent manual source");

    // T05, T07: real competing PostgreSQL transactions, separate rule cursors.
    const race = await makeLead();
    const raceEvent = await unassign(race);
    const assignmentsBefore = await count(race.id);
    await Promise.all([action(race.id, raceEvent), action(race.id, raceEvent, secondRule.id)]);
    assert.equal(await count(race.id), assignmentsBefore + 1);
    assert.equal(await prisma.lead_assignments.count({ where: { lead_id: race.id, is_main_owner: true } }), 1);
    assert.equal(await prisma.automation_reassignment_monitors.count({ where: { lead_id: race.id } }), 1);
    assert.equal(await prisma.audit_logs.count({ where: { entity_id: race.id, action: "automation_assignment_skipped" } }), 1);
    const independent = await makeLead();
    const independentEvent = await unassign(independent);
    const untouched = await cursor();
    await action(independent.id, independentEvent, secondRule.id);
    assert.equal(await cursor(), untouched);
    assert.ok(await cursor(secondRule.id));
    marks.push("T05 T07: independent cursors and competing rules create only one assignment/monitor");

    // T08/T09: delayed actions and old epochs cannot overwrite a newer manual assignment/unassignment.
    const protectedLead = await makeLead();
    const oldEvent = await unassign(protectedLead);
    assert.ok((await assignLeads(actor, [protectedLead.id], { assigneeId: b.id }, program.id)).ok);
    const beforeSkip = await cursor();
    await action(protectedLead.id, oldEvent);
    assert.equal(await owner(protectedLead.id), b.id);
    assert.equal(await cursor(), beforeSkip);
    const newEvent = await unassign(protectedLead);
    assert.notEqual(newEvent, oldEvent);
    await action(protectedLead.id, oldEvent);
    assert.equal(await owner(protectedLead.id), null);
    assert.equal(await cursor(), beforeSkip);
    await Promise.all([action(protectedLead.id, newEvent), save(protectedLead, c.id)]);
    assert.equal(await owner(protectedLead.id), c.id);
    assert.equal(await prisma.lead_assignments.count({ where: { lead_id: protectedLead.id, is_main_owner: true } }), 1);
    const fixedNode: AutomationNode = { id: "fixed", type: "action_assign", position: { x: 0, y: 0 }, data: { label: "Gán Sale", assignToUserId: a.id } };
    await action(protectedLead.id, newEvent, rule.id, fixedNode);
    assert.equal(await owner(protectedLead.id), c.id);
    marks.push("T08 T09: bulk/manual race; both assignment node types reject assigned/stale events");

    // Exercise the same protection after a real delayed Redis hop.
    const delayGraph: AutomationGraphData = { nodes: [graph.nodes[0],
      { id: "delay", type: "delay", position: { x: 0, y: 50 }, data: { label: "Chờ", delayMinutes: 20 } }, pool,
    ], edges: [{ id: "start-delay", source: "trigger", target: "delay" }, { id: "delay-pool", source: "delay", target: "pool" }] };
    const delayedRule = await makeRule("delayed", { is_active: true, graph_data: delayGraph });
    const delayedLead = await makeLead();
    await unassign(delayedLead);
    await queue.resume();
    const delayedLog = await until(() => prisma.automation_execution_logs.findFirst({ where: { rule_id: delayedRule.id }, include: { automation_node_executions: true } }),
      (log) => Boolean(log?.automation_node_executions.some((n) => n.node_id === "delay" && n.status === "completed")));
    assert.ok(delayedLog);
    assert.ok((await save(delayedLead, c.id)).ok);
    await until(() => prisma.automation_execution_logs.findUniqueOrThrow({ where: { id: delayedLog.id } }), (log) => log.status === "completed");
    await queue.pause();
    assert.equal(await owner(delayedLead.id), c.id);
    assert.equal(await cursor(delayedRule.id), undefined);
    assert.equal(await prisma.automation_reassignment_monitors.count({ where: { lead_id: delayedLead.id } }), 0);
    await prisma.automation_rules.update({ where: { id: delayedRule.id }, data: { is_active: false } });
    marks.push("T08: real Redis delay preserves a replacement Sale and does not advance cursor/create monitor");

    // T06: the assignment transaction commits, then downstream enqueue fails.
    const retryGraph: AutomationGraphData = { nodes: [...graph.nodes,
      { id: "after-assignment", type: "action_activity", position: { x: 0, y: 200 },
        data: { label: "Hoàn tất", activityType: "manual_unassignment_test", activityContent: "Đã chia lại Lead." } },
    ], edges: [...graph.edges, { id: "pool-after", source: "pool", target: "after-assignment" }] };
    const retryRule = await makeRule("retry-after-commit", { is_active: true, graph_data: retryGraph });
    const retryLead = await makeLead();
    await unassign(retryLead);
    const originalAfterCommitAdd = queue.add;
    let downstreamFailed = false;
    try {
      queue.add = async (...args: Parameters<typeof originalAfterCommitAdd>) => {
        if (args[1].nodeId === "after-assignment" && !downstreamFailed) {
          downstreamFailed = true;
          throw new Error("Injected downstream enqueue failure after assignment commit");
        }
        return originalAfterCommitAdd.apply(queue, args);
      };
      await queue.resume();
      await until(() => prisma.automation_execution_logs.findFirst({ where: { rule_id: retryRule.id } }),
        (log) => Boolean(log?.error_message?.includes("Injected downstream enqueue failure")));
      queue.add = originalAfterCommitAdd;
      const committedCursor = await cursor(retryRule.id);
      assert.ok(committedCursor);
      await until(() => prisma.automation_execution_logs.findFirst({ where: { rule_id: retryRule.id } }), (log) => log?.status === "completed");
      assert.equal(await cursor(retryRule.id), committedCursor);
      assert.equal(await count(retryLead.id), 2);
      assert.equal(await prisma.automation_reassignment_monitors.count({ where: { lead_id: retryLead.id } }), 1);
      assert.equal(await prisma.audit_logs.count({ where: { entity_id: retryLead.id, action: "automation_assignment_completed" } }), 1);
      assert.equal(await prisma.notifications.count({ where: { type: "lead_assignment", content: { contains: retryLead.full_name } } }), 2);
    } finally {
      queue.add = originalAfterCommitAdd;
      await queue.pause();
      await prisma.automation_rules.update({ where: { id: retryRule.id }, data: { is_active: false } });
    }
    marks.push("T06: Redis worker retry after committed assignment does not repeat cursor, notification or monitor");

    // T10-T12: old monitor jobs and old opens do not affect a new assignment.
    const oldAssignment = firstMonitor.assignment_id;
    await prisma.lead_assignments.update({ where: { id: oldAssignment }, data: { first_opened_at: new Date() } });
    const renewedEvent = await unassign(first);
    await action(first.id, renewedEvent);
    const currentAssignment = await prisma.lead_assignments.findFirstOrThrow({ where: { lead_id: first.id, is_main_owner: true } });
    assert.notEqual(currentAssignment.id, oldAssignment);
    assert.equal(currentAssignment.first_opened_at, null);
    const renewedMonitor = await prisma.automation_reassignment_monitors.findFirstOrThrow({ where: { assignment_id: currentAssignment.id } });
    assert.equal(renewedMonitor.reassignment_count, 0);
    const future = new Date(Date.now() + 120 * 60_000);
    await processReassignmentWarning(firstMonitor.id, new Date(firstMonitor.warning_due_at!.getTime() + 1));
    await processReassignmentExpiry(firstMonitor.id, future);
    assert.equal((await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: firstMonitor.id } })).completion_reason, "stale_assignment");
    const eventsBeforeExpiry = await prisma.automation_jobs.count({ where: { type: "manual_lead_unassignment" } });
    await processReassignmentExpiry(renewedMonitor.id, future);
    assert.equal(await prisma.automation_jobs.count({ where: { type: "manual_lead_unassignment" } }), eventsBeforeExpiry);
    const successor = await prisma.automation_reassignment_monitors.findFirstOrThrow({ where: { lead_id: first.id, reassignment_count: 1 } });
    assert.equal(successor.pool_cycle, 0);
    const assignedSale = await getAuthUser(successor.assignee_id, program.id);
    assert.ok(assignedSale);
    const opened = await initializeLeadOnOpen(assignedSale, first.id, program.id);
    assert.ok(opened.ok && opened.data.assignmentOpened);
    const beforeOpenExpiry = await owner(first.id);
    await processReassignmentExpiry(successor.id, future);
    assert.equal(await owner(first.id), beforeOpenExpiry);
    assert.equal((await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: successor.id } })).completion_reason, "lead_opened");
    marks.push("T10 T11 T12: stale jobs/opens cancelled; fresh monitor; expiry preserves counters; current open stops transfer");

    const expiryRaceLead = await makeLead();
    await action(expiryRaceLead.id, await unassign(expiryRaceLead));
    const racingMonitor = await monitor(expiryRaceLead.id);
    await Promise.all([save(expiryRaceLead, null), processReassignmentExpiry(racingMonitor.id, future)]);
    assert.equal(await owner(expiryRaceLead.id), null);
    assert.equal(await prisma.lead_assignments.count({ where: { lead_id: expiryRaceLead.id, is_main_owner: true } }), 0);
    marks.push("T10: concurrent manual removal and running expiry cannot restore a stale owner");

    // T13: limits and exhausted pools stop, never emit another manual-unassignment event.
    const limitLead = await makeLead();
    await action(limitLead.id, await unassign(limitLead));
    const limited = await monitor(limitLead.id);
    await prisma.automation_reassignment_monitors.update({ where: { id: limited.id }, data: { reassignment_count: policy.maxReassignments } });
    await processReassignmentExpiry(limited.id, future);
    assert.equal((await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: limited.id } })).completion_reason, "max_reassignments_reached");
    const exhaustedLead = await makeLead();
    await action(exhaustedLead.id, await unassign(exhaustedLead));
    const exhausted = await monitor(exhaustedLead.id);
    await prisma.automation_reassignment_monitors.update({ where: { id: exhausted.id }, data: { attempted_assignee_ids: [a.id, b.id, c.id] } });
    await processReassignmentExpiry(exhausted.id, future);
    assert.equal((await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: exhausted.id } })).status, "completed");
    const cycleLead = await makeLead();
    await action(cycleLead.id, await unassign(cycleLead));
    const cycleMonitor = await monitor(cycleLead.id);
    const cycleCount = await count(cycleLead.id);
    await prisma.automation_reassignment_monitors.update({ where: { id: cycleMonitor.id }, data: {
      attempted_assignee_ids: [a.id, b.id, c.id], pool_cycle: policy.maxPoolCycles,
      policy_snapshot: { ...policy, recyclePool: true },
    } });
    await processReassignmentExpiry(cycleMonitor.id, future);
    assert.equal(await count(cycleLead.id), cycleCount);
    assert.equal((await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: cycleMonitor.id } })).status, "completed");
    const noSaleLead = await makeLead();
    await action(noSaleLead.id, await unassign(noSaleLead));
    const noSaleMonitor = await monitor(noSaleLead.id);
    const noSaleCount = await count(noSaleLead.id);
    try {
      await prisma.users.updateMany({ where: { id: { in: [a.id, b.id, c.id] } }, data: { status: "inactive" } });
      await processReassignmentExpiry(noSaleMonitor.id, future);
    } finally {
      await prisma.users.updateMany({ where: { id: { in: [a.id, b.id, c.id] } }, data: { status: "active" } });
    }
    assert.equal(await count(noSaleLead.id), noSaleCount);
    assert.equal((await prisma.automation_reassignment_monitors.findUniqueOrThrow({ where: { id: noSaleMonitor.id } })).status, "completed");
    marks.push("T13: reassignment limit, maximum pool cycles, exhausted pool and no eligible Sale stop");

    // T14: durable event recovers a queue outage; revoked permission/scope cannot assign.
    const recoveryLead = await makeLead();
    const recoveryEvent = await unassign(recoveryLead);
    await prisma.automation_jobs.update({ where: { id: recoveryEvent }, data: { status: "pending", run_at: new Date() } });
    const outage = await events.dispatchManualUnassignmentEvent(recoveryEvent, async () => ({ matched: 1, started: 0, failed: 0, unavailable: true }));
    assert.equal(outage.ok, false);
    await prisma.automation_jobs.update({ where: { id: recoveryEvent }, data: { run_at: new Date() } });
    let recoveredId: string | undefined;
    const recovered = await events.recoverManualUnassignmentEvents(10, async (_type, context, options) => {
      recoveredId = context.manualUnassignmentEventId;
      assert.equal(options.eventId, recoveryEvent);
      return { matched: 0, started: 0, failed: 0, unavailable: false };
    }, [recoveryEvent]);
    assert.equal(recovered.completed, 1);
    assert.equal(recoveredId, recoveryEvent);
    const denied = await assignVisibleLead({ ...actor, permissions: [] }, recoveryLead.id, { assigneeId: a.id, manualUnassignmentEventId: recoveryEvent, skipIfAssigned: true }, program.id);
    assert.equal(denied.ok, false);
    assert.equal((await assignVisibleLead({ ...actor, accessScope: "ASSIGNED_ONLY", permissions: ["lead.assign", "lead.view_assigned"] }, recoveryLead.id, { assigneeId: a.id }, program.id)).ok, false);
    await prisma.leads.update({ where: { id: recoveryLead.id }, data: { deleted_at: new Date() } });
    assert.equal((await assignVisibleLead(actor, recoveryLead.id, { assigneeId: a.id, manualUnassignmentEventId: recoveryEvent }, program.id)).ok, false);
    marks.push("T14: persisted outage/recovery, denied permission/scope and deleted lead");

    // A real engine enqueue failure after execution creation must recover via its stable ID.
    const queueFailureLead = await makeLead();
    const queueFailureEvent = await unassign(queueFailureLead);
    await prisma.automation_rules.update({ where: { id: rule.id }, data: { is_active: true } });
    await prisma.automation_jobs.update({ where: { id: queueFailureEvent }, data: { status: "pending", run_at: new Date() } });
    const originalAdd = queue.add;
    try {
      queue.add = async () => { throw new Error("Injected Redis enqueue outage"); };
      assert.equal((await events.dispatchManualUnassignmentEvent(queueFailureEvent)).ok, false);
    } finally { queue.add = originalAdd; }
    const failedExecution = await prisma.automation_execution_logs.findUniqueOrThrow({ where: { id: automationEventExecutionId(queueFailureEvent, rule.id) } });
    assert.equal(failedExecution.status, "failed");
    await prisma.automation_jobs.update({ where: { id: queueFailureEvent }, data: { run_at: new Date() } });
    assert.equal((await events.recoverManualUnassignmentEvents(10, undefined, [queueFailureEvent])).completed, 1);
    await queue.resume();
    await until(() => prisma.automation_execution_logs.findUniqueOrThrow({ where: { id: failedExecution.id } }), (log) => log.status === "completed");
    await queue.pause();
    assert.ok(await owner(queueFailureLead.id));
    assert.equal(await count(queueFailureLead.id), 2);
    assert.equal(await prisma.automation_reassignment_monitors.count({ where: { lead_id: queueFailureLead.id } }), 1);
    await prisma.automation_rules.update({ where: { id: rule.id }, data: { is_active: false } });

    const revokedLead = await makeLead();
    const revokedEvent = await unassign(revokedLead);
    const assignPermissions = permissions.filter((p) => ["lead.assign", "lead.reassign"].includes(p.code)).map((p) => p.id);
    await prisma.role_permissions.deleteMany({ where: { role_id: managerRole.id, permission_id: { in: assignPermissions } } });
    await assert.rejects(action(revokedLead.id, revokedEvent), /permission_denied/);
    assert.equal(await owner(revokedLead.id), null);
    marks.push("T14: engine enqueue failure/recovery on the same execution ID; revoked stored permissions reject node execution");
    console.log(marks.join("\n"));
    console.log("Manual unassignment integration passed (PostgreSQL + Redis).");
  } finally {
    await queue.obliterate({ force: true });
    const { automationReassignmentQueue } = await import("../modules/automations/automation-reassignment-queue.service.js");
    await automationReassignmentQueue?.obliterate({ force: true });
    await engine.closeAutomationEngine();
    await redisCommandConnection?.quit();
    await redisConnection?.quit();
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
