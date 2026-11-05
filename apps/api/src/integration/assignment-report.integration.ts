import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { prisma } from "../database/prisma";
import { Prisma } from "../generated/prisma/client";
import { createAuthSession } from "../modules/auth/auth-session.service";
import { getAuthUser } from "../modules/auth/auth.service";
import { assignmentReportRouter } from "../modules/reports/assignment-report.router";
import { assignmentReportQuerySchema } from "../modules/reports/assignment-report-query";
import { getAssignmentReport, getAssignmentEventDetails, getAssignmentFilterOptions } from "../modules/reports/assignment-report.service";

async function main() {
  const database = new URL(process.env.DATABASE_URL!).pathname;
  assert.match(database, /^\/crm_assignment_report_test_\d+$/, "Run through the isolated test runner only.");
  const [program, otherProgram] = await Promise.all(["A", "B"].map((name) => prisma.institution_programs.create({ data: { name, code: name, institution_name: "Test" } })));
  const [depA, depB] = await Promise.all(["Nhóm A", "Nhóm B"].map((name) => prisma.departments.create({ data: { name } })));
  const [director, saleA, saleB, manager, denied] = await Promise.all(["Director", "An", "Bình", "Manager", "Denied"].map((name) => prisma.users.create({ data: { email: `${name}@example.test`, full_name: name, password_hash: "test-only" } })));
  for (const scope of ["ALL", "DEPARTMENT", "ASSIGNED_ONLY"]) await prisma.access_scopes.create({ data: { code: scope, name: scope } });
  const perms = await Promise.all(["report.view_all", "report.sale.view_department", "report.sale.view_assigned", "lead.view_all", "lead.view_department", "lead.view_assigned"].map((code) => prisma.permissions.create({ data: { code, name: code, module: "report" } })));
  for (const [user, scope, codes] of [[director, "ALL", ["report.view_all", "lead.view_all"]], [manager, "DEPARTMENT", ["report.sale.view_department", "lead.view_department"]], [saleA, "ASSIGNED_ONLY", ["report.sale.view_assigned", "lead.view_assigned"]], [denied, "ALL", []]] as const) {
    const role = await prisma.roles.create({ data: { code: `TEST_${user.id}`, name: user.full_name } });
    await prisma.role_access_scopes.create({ data: { role_id: role.id, scope_code: scope } });
    await prisma.role_permissions.createMany({ data: perms.filter((p) => (codes as readonly string[]).includes(p.code)).map((p) => ({ role_id: role.id, permission_id: p.id })) });
    await prisma.role_institution_programs.create({ data: { role_id: role.id, institution_program_id: program.id } });
    await prisma.user_program_roles.create({ data: { user_id: user.id, institution_program_id: program.id, role_id: role.id } });
  }
  await prisma.user_departments.createMany({ data: [{ user_id: manager.id, department_id: depA.id }, { user_id: saleA.id, department_id: depA.id }, { user_id: saleB.id, department_id: depB.id }] });
  const actor = (await getAuthUser(director.id, program.id))!;
  const teamActor = (await getAuthUser(manager.id, program.id))!;
  const ownActor = (await getAuthUser(saleA.id, program.id))!;
  const source = await prisma.lead_sources.create({ data: { name: "Nguồn ban đầu" } });
  const campaign1 = await prisma.campaigns.create({ data: { name: "Chiến dịch Z", institution_program_id: program.id } });
  const campaign2 = await prisma.campaigns.create({ data: { name: "Chiến dịch A", institution_program_id: program.id } });
  const lead = await prisma.leads.create({ data: { full_name: "Lead kiểm thử", phone: "0900000000", email: "private@example.test", cccd: "private", source_id: source.id, institution_program_id: program.id, owner_id: director.id } });
  await prisma.utm_trackings.createMany({ data: [campaign1, campaign2, campaign1].map((campaign) => ({ lead_id: lead.id, campaign_id: campaign.id })) });
  const rule = await prisma.automation_rules.create({ data: { name: "Phân bổ tự động", institution_program_id: program.id, trigger_type: "lead_created", graph_data: { nodes: [], edges: [] } } });
  const assignmentA = await prisma.$transaction(async (tx) => {
    const assignment = await tx.lead_assignments.create({ data: { lead_id: lead.id, assigned_to: saleA.id, department_id: depA.id } });
    await tx.leads.update({ where: { id: lead.id }, data: { assigned_to: saleA.id } });
    const execution = await tx.automation_execution_logs.create({ data: { rule_id: rule.id } });
    const node = await tx.automation_node_executions.create({ data: { execution_log_id: execution.id, node_id: "assign", node_type: "action_assign" } });
    await tx.automation_node_executions.update({ where: { id: node.id }, data: { assignment_result: { kind: "assigned", assignmentId: assignment.id } } });
    return assignment;
  });
  const monitor = await prisma.automation_reassignment_monitors.create({ data: { rule_id: rule.id, node_id: "assign", assignment_id: assignmentA.id, lead_id: lead.id, assignee_id: saleA.id, institution_program_id: program.id, reassignment_due_at: new Date(), attempted_assignee_ids: [], node_snapshot: {}, policy_snapshot: {} } });
  await prisma.automation_reassignment_monitors.update({ where: { id: monitor.id }, data: { warned_at: new Date("2026-10-31T16:59:59Z") } });
  await prisma.automation_reassignment_monitors.update({ where: { id: monitor.id }, data: { second_warned_at: new Date("2026-10-31T17:00:00Z") } });
  await prisma.automation_reassignment_monitors.update({ where: { id: monitor.id }, data: { second_warned_at: new Date("2026-10-31T17:00:00Z") } });
  const assignmentB = await prisma.$transaction(async (tx) => {
    await tx.lead_assignments.updateMany({ where: { lead_id: lead.id }, data: { is_main_owner: false } });
    const assignment = await tx.lead_assignments.create({ data: { lead_id: lead.id, assigned_to: saleB.id, department_id: depB.id } });
    await tx.leads.update({ where: { id: lead.id }, data: { assigned_to: saleB.id } });
    await tx.automation_reassignment_monitors.update({ where: { id: monitor.id }, data: { status: "reassigned", next_assignment_id: assignment.id } });
    return assignment;
  });
  await prisma.leads.update({ where: { id: lead.id }, data: { source_id: null } });
  await prisma.lead_sources.update({ where: { id: source.id }, data: { name: "Nguồn đã đổi tên" } });
  await prisma.campaigns.update({ where: { id: campaign1.id }, data: { name: "Chiến dịch đã đổi tên" } });
  await prisma.leads.update({ where: { id: lead.id }, data: { assigned_to: null } });
  await prisma.lead_assignments.update({ where: { id: assignmentB.id }, data: { is_main_owner: false } });
  const again = await prisma.lead_assignments.create({ data: { lead_id: lead.id, assigned_to: saleB.id, department_id: depB.id } });
  await prisma.leads.update({ where: { id: lead.id }, data: { assigned_to: saleB.id } });
  await prisma.lead_assignments.update({ where: { id: again.id }, data: { is_main_owner: false } });
  await prisma.lead_assignments.create({ data: { lead_id: lead.id, assigned_to: saleB.id, department_id: depB.id } });
  const base = assignmentReportQuerySchema.parse({ fromDate: "2020-01-01", toDate: "2100-12-31" });
  const report = await getAssignmentReport(actor, program.id, base);
  assert.deepEqual(report.summary, { ASSIGNED: 3, WARNING_1: 1, WARNING_2: 1, WITHDRAWN: 2 });
  assert.equal(report.pagination.total, 2);
  for (const type of ["ASSIGNED", "WARNING_1", "WARNING_2", "WITHDRAWN"] as const) {
    assert.equal(report.rows.reduce((sum, row) => sum + row[type], 0), report.summary[type]);
    const details = await getAssignmentEventDetails(actor, program.id, { ...base, eventTypes: [type] });
    assert.equal(details.pagination.total, report.summary[type]);
    assert.ok(!JSON.stringify(details).includes("private@example.test"));
    assert.ok(!JSON.stringify(details).includes('"cccd"'));
  }
  assert.equal((await getAssignmentReport(actor, program.id, { ...base, method: "AUTOMATIC" })).summary.ASSIGNED, 2);
  assert.equal((await getAssignmentReport(actor, program.id, { ...base, method: "MANUAL" })).summary.ASSIGNED, 1);
  assert.equal((await getAssignmentReport(actor, program.id, { ...base, sourceIds: [source.id] })).summary.ASSIGNED, 2);
  assert.equal((await getAssignmentReport(actor, program.id, { ...base, campaignIds: [campaign1.id, campaign2.id] })).summary.ASSIGNED, 3, "Many campaign matches must not multiply events");
  const ruleReport = await getAssignmentReport(actor, program.id, { ...base, ruleIds: [rule.id] });
  assert.deepEqual(ruleReport.summary, { ASSIGNED: 2, WARNING_1: 1, WARNING_2: 1, WITHDRAWN: 1 });
  assert.equal((await getAssignmentReport(actor, program.id, { ...base, fromDate: "2026-11-01", toDate: "2026-11-01" })).summary.WARNING_1, 0);
  assert.equal((await getAssignmentReport(actor, program.id, { ...base, fromDate: "2026-11-01", toDate: "2026-11-01" })).summary.WARNING_2, 1);
  assert.deepEqual((await getAssignmentReport(teamActor, program.id, base)).summary, { ASSIGNED: 1, WARNING_1: 1, WARNING_2: 1, WITHDRAWN: 1 });
  const historical = await getAssignmentEventDetails(ownActor, program.id, base);
  assert.equal(historical.pagination.total, 4, "Former assignee retains their historical metrics");
  assert.ok(historical.rows.every((event) => event.leadId === null && event.leadName === null), "Current scope protects lead identity after reassignment");
  assert.equal((await getAssignmentReport({ ...actor, institutionProgramIds: [] }, program.id, base)).pagination.total, 0);
  assert.equal((await getAssignmentReport({ ...actor, permissions: [], roles: ["DIRECTOR"] }, program.id, base)).pagination.total, 0);
  assert.equal((await getAssignmentReport(actor, otherProgram.id, base)).pagination.total, 0);
  assert.equal((await getAssignmentReport(teamActor, program.id, { ...base, assigneeIds: [saleB.id] })).pagination.total, 0);
  const sources = await getAssignmentFilterOptions(actor, program.id, { kind: "source", search: "ban đầu", departmentIds: [], page: 1 });
  assert.equal(sources.items[0].name, "Nguồn ban đầu", "Options use historical labels");
  const campaigns = await getAssignmentFilterOptions(actor, program.id, { kind: "campaign", search: "", departmentIds: [], page: 1 });
  assert.equal(campaigns.items.find((item) => item.id === campaign1.id)?.name, "Chiến dịch Z", "Campaign ID/name arrays remain aligned");
  assert.equal((await getAssignmentFilterOptions(teamActor, program.id, { kind: "assignee", search: "", departmentIds: [depB.id], page: 1 })).items.length, 0);
  assert.equal((await getAssignmentReport(actor, program.id, { ...base, limit: 1, page: 2, sortBy: "name", sortOrder: "asc" })).rows.length, 1);
  const beforeRollback = report.summary.ASSIGNED;
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.lead_assignments.create({ data: { lead_id: lead.id, assigned_to: saleA.id, department_id: depA.id } });
    throw new Error("Rollback assignment");
  }), /Rollback assignment/);
  assert.equal((await getAssignmentReport(actor, program.id, base)).summary.ASSIGNED, beforeRollback, "Reporting facts roll back with business writes");

  // Another program's real events must never influence this program's totals or options.
  const otherLead = await prisma.leads.create({ data: { full_name: "Hidden", phone: "0911111111", institution_program_id: otherProgram.id } });
  await prisma.lead_assignments.create({ data: { lead_id: otherLead.id, assigned_to: saleA.id, department_id: depA.id } });
  assert.deepEqual((await getAssignmentReport(actor, program.id, base)).summary, report.summary);

  const app = express(); app.use("/reports/assignments", assignmentReportRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/reports/assignments`;
  const token = (await createAuthSession(director.id, "test-only", false))!.accessToken;
  const deniedToken = (await createAuthSession(denied.id, "test-only", false))!.accessToken;
  const headers = { authorization: `Bearer ${token}`, "x-institution-program-id": program.id };
  const dates = "fromDate=2020-01-01&toDate=2100-12-31";
  try {
    assert.equal((await fetch(`${url}?${dates}`)).status, 401);
    assert.equal((await fetch(`${url}?${dates}`, { headers: { ...headers, authorization: `Bearer ${deniedToken}` } })).status, 403);
    assert.equal((await fetch(`${url}?${dates}`, { headers: { ...headers, "x-institution-program-id": otherProgram.id } })).status, 403);
    assert.equal((await fetch(`${url}?${dates}&sortBy=unsafe`, { headers })).status, 400);
    const response = await fetch(`${url}?${dates}`, { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual((await response.json()).summary, report.summary);
    assert.equal((await fetch(`${url}/events?${dates}&assigneeIds=${saleA.id}`, { headers })).status, 200);
    assert.equal((await fetch(`${url}/options?kind=rule`, { headers })).status, 200);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }

  // Exercise the index against 50,000 additional facts; discard them afterwards.
  const rollback = new Error("performance fixture rollback");
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`INSERT INTO lead_assignment_report_events(event_key,event_type,assignment_id,lead_id,institution_program_id,assignee_id,assignee_name,reason)
      SELECT 'perf:'||i,'ASSIGNED',gen_random_uuid(),${lead.id}::uuid,${program.id}::uuid,gen_random_uuid(),'Perf','Perf' FROM generate_series(1,50000) i`);
    await tx.$executeRawUnsafe('ANALYZE lead_assignment_report_events');
    const plan = await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON) SELECT COUNT(*) FROM lead_assignment_report_events WHERE institution_program_id=${program.id}::uuid AND assignee_id=${saleA.id}::uuid AND occurred_at >= ${new Date("2020-01-01")}`);
    const encoded = JSON.stringify(plan);
    assert.match(encoded, /idx_assignment_report_assignee_time/);
    console.log("50,000-event EXPLAIN: scoped assignee index used");
    throw rollback;
  }, { timeout: 60000 }), (error) => error === rollback);
  console.log("PASS: capture, snapshots, deduplication, rollback, filters, pagination, time zones, scope, identity masking, authenticated API and 50,000-event query plan");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
