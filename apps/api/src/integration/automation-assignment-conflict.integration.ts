import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AutomationNode } from "../modules/automations/automation.types";
import type { AutomationAssignmentResult } from "@admission-crm/shared/automation-assignment";

async function main() {
  process.env.NODE_ENV = "test";
  process.env.DISABLE_REDIS = "true";
  const { env } = await import("../config/env.js");
  assert.match(new URL(env.DATABASE_URL).pathname, /^\/crm_manual_unassign_test_\d+$/, "Run only in the isolated test database.");
  const { prisma } = await import("../database/prisma.js");
  const { executeRegisteredAutomationNode: execute } = await import("../modules/automations/automation-action-registry.js");
  const { getAuthUser } = await import("../modules/auth/auth.service.js");
  const { assignVisibleLead } = await import("../modules/leads/application/lead-owner-stage.use-cases.js");
  const { getAutomationExecutionForOperations } = await import("../modules/automations/automation-observability.service.js");
  const { visibleAssignmentResults } = await import("../modules/automations/automation-assignment-result.serializer.js");
  try {
    const program = await prisma.institution_programs.findFirstOrThrow();
    const source = await prisma.lead_sources.findFirstOrThrow();
    const managerRole = await prisma.roles.create({ data: { code: "CONFLICT_MANAGER", name: "Manager" } });
    const saleRole = await prisma.roles.create({ data: { code: "CONFLICT_SALE", name: "Sale" } });
    const permissions = await prisma.permissions.findMany();
    await prisma.role_permissions.createMany({ data: permissions.filter((p) => ["lead.assign", "lead.reassign", "lead.view_all", "automation.manage", "automation.view_logs"].includes(p.code)).map((p) => ({ role_id: managerRole.id, permission_id: p.id })) });
    await prisma.role_permissions.create({ data: { role_id: saleRole.id, permission_id: permissions.find((p) => p.code === "lead.view_assigned")!.id } });
    await prisma.role_access_scopes.createMany({ data: [{ role_id: managerRole.id, scope_code: "ALL" }, { role_id: saleRole.id, scope_code: "ASSIGNED_ONLY" }] });
    await prisma.role_institution_programs.createMany({ data: [managerRole.id, saleRole.id].map((role_id) => ({ role_id, institution_program_id: program.id })) });
    const users = await Promise.all(["Manager", "Sale A", "Sale B"].map((full_name) => prisma.users.create({ data: { full_name, email: randomUUID() + "@example.test", password_hash: "test-only" } })));
    const [manager, a, b] = users;
    await prisma.user_program_roles.createMany({ data: users.map((user, i) => ({ user_id: user.id, institution_program_id: program.id, role_id: i ? saleRole.id : managerRole.id })) });
    const actor = await getAuthUser(manager.id, program.id);
    assert.ok(actor);
    const rules = await Promise.all(["Rule A", "Rule B"].map((name) => prisma.automation_rules.create({ data: { name, trigger_type: "lead_created", institution_program_id: program.id, created_by: manager.id, graph_data: { nodes: [], edges: [] } } })));
    const direct = (id: string): AutomationNode => ({ id: "assign", type: "action_assign", position: { x: 0, y: 0 }, data: { label: "Gán Sale", assignToUserId: id } });
    const pool: AutomationNode = { id: "pool", type: "action_assign_pool", position: { x: 0, y: 0 }, data: { label: "Chia Lead", assignmentStrategy: "round_robin", assigneeIds: [a.id, b.id] } };
    let sequence = 0;
    const lead = () => prisma.leads.create({ data: { full_name: "Conflict lead " + ++sequence, phone: "090000" + sequence.toString().padStart(4, "0"), source_id: source.id, institution_program_id: program.id, owner_id: manager.id } });
    const delivery = async (leadId: string, node: AutomationNode, rule = rules[0], extra = {}) => {
      const log = await prisma.automation_execution_logs.create({ data: { rule_id: rule.id, status: "processing", execution_actor_id: manager.id } });
      const saved = await prisma.automation_node_executions.create({ data: { execution_log_id: log.id, node_id: node.id, node_type: node.type } });
      const context = { ruleId: rule.id, actorId: manager.id, leadId, institutionProgramId: program.id, ...extra };
      return { saved, log, run: () => execute(node, context, saved.id) };
    };
    const result = async (id: string) => (await prisma.automation_node_executions.findUniqueOrThrow({ where: { id } })).assignment_result as unknown as AutomationAssignmentResult;
    const owner = async (id: string) => (await prisma.leads.findUniqueOrThrow({ where: { id } })).assigned_to;
    const assignmentCount = (id: string) => prisma.lead_assignments.count({ where: { lead_id: id } });
    const auditCount = (id: string) => prisma.audit_logs.count({ where: { entity_id: id } });

    // Two independent transactions contend for the same lead, in either arrival order.
    for (let turn = 0; turn < 4; turn++) {
      const item = await lead();
      const jobs = await Promise.all([delivery(item.id, direct(a.id)), delivery(item.id, direct(b.id), rules[1])]);
      await Promise.all((turn % 2 ? jobs.reverse() : jobs).map((job) => job.run()));
      const outcomes = await Promise.all(jobs.map((job) => result(job.saved.id)));
      assert.deepEqual(outcomes.map((o) => o.kind).sort(), ["assigned", "conflict"]);
      const winner = outcomes.find((o) => o.kind === "assigned")!;
      const blocked = outcomes.find((o) => o.kind === "conflict")!;
      assert.equal(await owner(item.id), winner.currentAssigneeId);
      assert.deepEqual(blocked.source, winner.source);
      assert.equal(await assignmentCount(item.id), 1);
      assert.equal(await prisma.notifications.count({ where: { type: "lead_assignment", content: { contains: item.full_name } } }), 1);
      const audits = await auditCount(item.id);
      await Promise.all(jobs.flatMap((job) => [job.run(), job.run()]));
      assert.equal(await auditCount(item.id), audits);
      assert.equal(await assignmentCount(item.id), 1);
      const detail = await getAutomationExecutionForOperations(actor, jobs[0].log.id);
      assert.ok(detail?.nodes[0].assignmentResult);
      const hidden = await visibleAssignmentResults([await prisma.automation_node_executions.findUniqueOrThrow({ where: { id: jobs[0].saved.id } }).then((n) => n.assignment_result)], { id: { in: [] } });
      assert.equal(hidden[0]?.source, null);
      assert.equal(hidden[0]?.sourceRestricted, true);
      assert.equal(await getAutomationExecutionForOperations({ ...actor, workingInstitutionProgramId: randomUUID(), institutionProgramIds: [] }, jobs[0].log.id), null);
    }
    console.log("PASS: concurrent rules, first writer preserved, provenance, retry idempotency, scoped API");

    const manual = await lead();
    assert.ok((await assignVisibleLead(actor, manual.id, { assigneeId: a.id }, program.id)).ok);
    await prisma.leads.update({ where: { id: manual.id }, data: { secondary_assigned_to: b.id } });
    const blocked = await delivery(manual.id, direct(b.id)); await blocked.run();
    assert.equal((await result(blocked.saved.id)).kind, "conflict");
    assert.equal((await result(blocked.saved.id)).source, null);
    const same = await delivery(manual.id, direct(a.id)); await same.run();
    assert.equal((await result(same.saved.id)).kind, "unchanged");
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: manual.id } })).secondary_assigned_to, b.id);
    const blockedPool: AutomationNode = { ...pool, data: { ...pool.data, reassignmentPolicy: {
      enabled: true, interactionCriterion: "not_opened_since_assignment" as const, timeoutMinutes: 60,
      assignToAnotherSale: true, excludeCurrentAssignee: true, maxReassignments: 3,
      recyclePool: false, maxPoolCycles: 1, warningEnabled: false, warningBeforeMinutes: 30,
      warningContent: "Mở Lead", notifyOnRemoval: true,
    } } };
    const pooled = await delivery(manual.id, blockedPool); await pooled.run();
    assert.equal((await result(pooled.saved.id)).kind, "conflict");
    assert.equal(await prisma.automation_assignment_cursors.count(), 0);
    assert.equal(await prisma.automation_reassignment_monitors.count(), 0);
    console.log("PASS: manual assignment preserved, same sale, secondary retained, pool cursor unchanged");

    const poolLead = await lead();
    const poolJob = await delivery(poolLead.id, pool); await Promise.all([poolJob.run(), poolJob.run()]);
    assert.equal(await assignmentCount(poolLead.id), 1);
    const cursor = await prisma.automation_assignment_cursors.findFirstOrThrow();
    const anotherPool = await delivery(poolLead.id, pool, rules[1]); await anotherPool.run();
    assert.equal(await prisma.automation_assignment_cursors.count(), 1);
    assert.equal((await prisma.automation_assignment_cursors.findFirstOrThrow()).last_assignee_id, cursor.last_assignee_id);
    console.log("PASS: pool assignment and duplicate concurrent delivery");
    for (const strategy of ["least_loaded", "weighted"] as const) {
      const item = await lead();
      const poolNode = { ...pool, data: { ...pool.data, assignmentStrategy: strategy } };
      const jobs = await Promise.all([delivery(item.id, direct(a.id)), delivery(item.id, poolNode, rules[1])]);
      await Promise.all(jobs.map((job) => job.run()));
      const outcomes = await Promise.all(jobs.map((job) => result(job.saved.id)));
      assert.deepEqual(outcomes.map((o) => o.kind).sort(), ["assigned", "conflict"]);
      assert.equal(await assignmentCount(item.id), 1);
    }
    console.log("PASS: direct versus least-loaded/weighted pools concurrently");

    const rollback = await lead();
    const rollbackJob = await delivery(rollback.id, direct(a.id));
    await prisma.automation_node_executions.delete({ where: { id: rollbackJob.saved.id } });
    await assert.rejects(rollbackJob.run());
    assert.equal(await owner(rollback.id), null);
    assert.equal(await assignmentCount(rollback.id), 0);
    assert.equal(await auditCount(rollback.id), 0);
    // Failure after the assignment was written must roll back all effects and cursor advancement.
    await assert.rejects(assignVisibleLead(actor, rollback.id, { resolveAssigneeId: async (tx) => {
      await tx.automation_assignment_cursors.create({ data: { rule_id: rules[1].id, node_id: "rollback", last_assignee_id: b.id } });
      return b.id;
    } }, program.id, async () => { throw new Error("checkpoint failure"); }));
    assert.equal(await owner(rollback.id), null);
    assert.equal(await assignmentCount(rollback.id), 0);
    assert.equal(await auditCount(rollback.id), 0);
    assert.equal(await prisma.automation_assignment_cursors.count({ where: { node_id: "rollback" } }), 0);
    console.log("PASS: checkpoint failure rolls back owner, assignment, audit, notification and cursor");

    const stale = await lead();
    const staleJob = await delivery(stale.id, direct(a.id), rules[0], { manualUnassignmentEventId: randomUUID() });
    await staleJob.run();
    assert.equal((await result(staleJob.saved.id)).kind, "stale_event");
    assert.equal(await owner(stale.id), null);
    const formLead = await lead();
    const formJob = await delivery(formLead.id, direct(a.id), rules[0], { marketingFormSubmissionId: randomUUID() });
    await formJob.run();
    const formOther = await delivery(formLead.id, direct(b.id), rules[1], { marketingFormSubmissionId: randomUUID() });
    await formOther.run();
    assert.equal(await owner(formLead.id), a.id);
    assert.equal((await result(formOther.saved.id)).kind, "conflict");
    console.log("PASS: stale manual event and form assignment guard");
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
