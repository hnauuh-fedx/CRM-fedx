import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AutomationNode, AutomationGraphData } from "../modules/automations/automation.types";

process.env.NODE_ENV = "test";
process.env.DISABLE_REDIS = "true";
process.env.DISABLE_AUTOMATION_WORKER = "true";

async function main() {
  const [{ prisma }, { getAuthUser }, bulk, service, { automationBulkFilterSchema }, { executeRegisteredAutomationNode }] = await Promise.all([
    import("../database/prisma.js"), import("../modules/auth/auth.service.js"),
    import("../modules/automations/automation-bulk.service.js"), import("../modules/automations/automation.service.js"),
    import("../modules/automations/automation-bulk-filter.js"), import("../modules/automations/automation-action-registry.js"),
  ]);
  try {
    const programs = await prisma.institution_programs.findMany({ orderBy: { code: "asc" }, take: 2 });
    assert.equal(programs.length, 2);
    const director = await prisma.users.findUniqueOrThrow({ where: { email: "director@tvu.edu.vn" } });
    const role = await prisma.roles.findUniqueOrThrow({ where: { code: "DIRECTOR" } });
    await prisma.user_program_roles.createMany({ data: programs.map((program) => ({ user_id: director.id, institution_program_id: program.id, role_id: role.id })), skipDuplicates: true });
    const actor = await getAuthUser(director.id, programs[0].id);
    assert.ok(actor);
    const matchIds = Array.from({ length: 65 }, () => randomUUID());
    const otherId = randomUUID(), foreignId = randomUUID(), deletedId = randomUUID();
    await prisma.leads.createMany({ data: [
      ...matchIds.map((id, index) => ({ id, full_name: `Match ${index}`, phone: `090${String(index).padStart(7, "0")}`, institution_program_id: programs[0].id, owner_id: actor.id, assigned_to: index < 5 ? actor.id : null })),
      { id: otherId, full_name: "Other", phone: "0909999900", institution_program_id: programs[0].id, owner_id: actor.id },
      { id: foreignId, full_name: "Match foreign", phone: "0909999901", institution_program_id: programs[1].id, owner_id: actor.id },
      { id: deletedId, full_name: "Match deleted", phone: "0909999902", institution_program_id: programs[0].id, owner_id: actor.id, deleted_at: new Date() },
    ] });
    const selected = automationBulkFilterSchema.parse({ target: "selected", audience: "all", leadIds: [matchIds[0], foreignId, deletedId] });
    assert.equal((await bulk.previewAutomationBulkLeads(actor, programs[0].id, selected))?.total, 1);
    const filtered = automationBulkFilterSchema.parse({ target: "filtered", filters: { audience: "all", search: "Match" } });
    assert.equal((await bulk.previewAutomationBulkLeads(actor, programs[0].id, filtered))?.total, 65);
    const all = automationBulkFilterSchema.parse({ target: "filtered", filters: { audience: "all" } });
    assert.equal((await bulk.previewAutomationBulkLeads(actor, programs[0].id, all))?.total, 66);
    const restricted = { ...actor, accessScope: "ASSIGNED_ONLY" as const, permissions: ["automation.manage", "lead.view_assigned"] };
    assert.equal((await bulk.previewAutomationBulkLeads(restricted, programs[0].id, all))?.total, 5);
    const students = automationBulkFilterSchema.parse({ target: "filtered", filters: { audience: "students" } });
    await assert.rejects(() => bulk.previewAutomationBulkLeads(restricted, programs[0].id, students), /quyền xem học viên/);
    const advanced = automationBulkFilterSchema.parse({ target: "filtered", filters: { audience: "all", filterConditions: [{ field: "fullName", operator: "EQUALS", value: "Match 0" }] } });
    assert.equal((await bulk.previewAutomationBulkLeads(actor, programs[0].id, advanced))?.total, 1);
    const sensitive = automationBulkFilterSchema.parse({ target: "filtered", filters: { filterConditions: [{ field: "phone", operator: "CONTAINS", value: "090" }] } });
    await assert.rejects(() => bulk.previewAutomationBulkLeads(restricted, programs[0].id, sensitive), /quyền/);
    const list = await prisma.customer_lists.create({ data: { name: "Rerun list", created_by: actor.id, institution_program_id: programs[0].id } });
    await prisma.customer_list_members.createMany({ data: matchIds.slice(0, 2).map((leadId) => ({ customer_list_id: list.id, lead_id: leadId, added_by: actor.id })) });
    const listTarget = automationBulkFilterSchema.parse({ target: "filtered", filters: { audience: "all" }, customerListId: list.id });
    assert.equal((await bulk.previewAutomationBulkLeads(actor, programs[0].id, listTarget))?.total, 2);
    assert.equal((await bulk.previewAutomationBulkLeads(actor, programs[0].id, { customerListId: list.id }))?.total, 2);

    const node = (id: string, type: AutomationNode["type"], data: AutomationNode["data"]): AutomationNode => ({ id, type, data, position: { x: 0, y: 0 } });
    const graph: AutomationGraphData = { nodes: [
      node("trigger", "trigger", { label: "Khởi động", triggerType: "lead_created" }),
      node("condition", "condition", { label: "Điều kiện", field: "system:fullName", operator: "contains", value: "Match" }),
      node("activity", "action_activity", { label: "Ghi hoạt động", activityType: "rerun_test", activityContent: "Đã chạy lại rule" }),
    ], edges: [{ id: "first", source: "trigger", target: "condition" }, { id: "second", source: "condition", target: "activity", sourceHandle: "default" }] };
    const rule = await prisma.automation_rules.create({ data: { name: "Rerun fixture", trigger_type: "lead_created", graph_data: JSON.parse(JSON.stringify(graph)), institution_program_id: programs[0].id, created_by: actor.id } });
    const foreignRule = await prisma.automation_rules.create({ data: { name: "Foreign", trigger_type: "lead_created", graph_data: JSON.parse(JSON.stringify(graph)), institution_program_id: programs[1].id, created_by: actor.id } });
    assert.deepEqual(await service.previewAutomationBulkRun(actor, foreignRule.id, all), { ok: false, reason: "rule_not_found" });
    const jobId = randomUUID();
    const start = await service.startAutomationBulkRun(actor, rule.id, filtered, jobId);
    assert.deepEqual(start, { ok: false, reason: "queue_unavailable" });
    const job = await prisma.automation_jobs.findUniqueOrThrow({ where: { id: jobId } });
    assert.equal(job.total_count, 65);
    assert.equal(await prisma.audit_logs.count({ where: { entity_id: rule.id, action: "bulk_run_started" } }), 1);
    const lateId = randomUUID();
    await prisma.leads.create({ data: { id: lateId, full_name: "Match late", phone: "0909999903", institution_program_id: programs[0].id, created_at: new Date(Date.now() + 60_000) } });
    assert.equal(await bulk.materializeAutomationBulkDispatches(jobId, 17), 65);
    assert.equal(await bulk.materializeAutomationBulkDispatches(jobId, 17), 65);
    const dispatchedIds: string[] = []; let cursor: string | undefined;
    do { const page = await bulk.prepareAutomationBulkLeadPage(jobId, cursor, 17); dispatchedIds.push(...page.leadIds); cursor = page.nextCursor; if (!page.hasMore) break; } while (cursor);
    assert.deepEqual(new Set(dispatchedIds), new Set(matchIds));
    const retry = await service.startAutomationBulkRun(actor, rule.id, filtered, jobId);
    assert.deepEqual(retry, { ok: false, reason: "queue_unavailable" });
    assert.equal(await prisma.automation_jobs.count({ where: { id: jobId } }), 1);
    await prisma.leads.update({ where: { id: matchIds[1] }, data: { deleted_at: new Date() } });
    assert.deepEqual(await bulk.executeAutomationBulkLead(jobId, matchIds[1]), { ok: false, reason: "lead_not_found" });
    for (const [leadId, expected] of [[matchIds[0], "default"], [otherId, "false"]] as const) {
      const log = await prisma.automation_execution_logs.create({ data: { rule_id: rule.id, source: "bulk", requested_by: actor.id } });
      const condition = await prisma.automation_node_executions.create({ data: { execution_log_id: log.id, node_id: "condition", node_type: "condition" } });
      const context = { ruleId: rule.id, actorId: actor.id, institutionProgramId: programs[0].id, leadId };
      const result = await executeRegisteredAutomationNode(graph.nodes[1], context, condition.id);
      assert.equal(result.nextSourceHandle, expected);
      if (expected === "default") {
        const action = await prisma.automation_node_executions.create({ data: { execution_log_id: log.id, node_id: "activity", node_type: "action_activity" } });
        await executeRegisteredAutomationNode(graph.nodes[2], context, action.id);
      }
    }
    assert.equal(await prisma.lead_activities.count({ where: { lead_id: matchIds[0], type: "rerun_test" } }), 1);
    assert.equal(await prisma.lead_activities.count({ where: { lead_id: otherId, type: "rerun_test" } }), 0);
    console.log("PASS: selected/scoped/all filters, 65 leads across pages, parent list, foreign rule, sensitive permission, snapshot, idempotency, deleted lead and condition branches");
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
