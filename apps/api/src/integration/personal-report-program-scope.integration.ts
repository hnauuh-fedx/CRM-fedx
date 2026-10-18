import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { reportsRouter } from "../modules/reports/reports.router";

async function main() {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname));
  const prefix = "REPORT_SCOPE_" + randomUUID().slice(0, 8);
  const programs = [randomUUID(), randomUUID()];
  const pipelines = [randomUUID(), randomUUID()];
  const stages = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const users = [randomUUID(), randomUUID()];
  const roleId = randomUUID(), sourceId = randomUUID();
  const app = express(); app.use(express.json()); app.use("/reports", reportsRouter);
  const server = app.listen(0); const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const token = jwt.sign({ sub: users[0], type: "access" }, env.JWT_SECRET);
  async function request(programId: string, path: string, method = "GET", body?: unknown) {
    const response = await fetch(base + path, { method, headers: { authorization: "Bearer " + token, "content-type": "application/json", "x-institution-program-id": programId }, body: body ? JSON.stringify(body) : undefined });
    const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, body: payload };
  }
  const input = (conditions: unknown[] = []) => ({ name: "Báo cáo kiểm thử " + prefix, module: "SALE", metricKeys: ["totalLeads"], chartType: "TABLE", mode: "SINGLE", datasetKey: "LEADS", singleDimensionKey: "SOURCE", singleDisplay: "TABLE", conditions, dateGranularity: "DAY" });
  try {
    await prisma.institution_programs.createMany({ data: programs.map((id, i) => ({ id, code: prefix + i, name: "Chương trình " + i, institution_name: "Trường kiểm thử" })) });
    await prisma.pipelines.createMany({ data: pipelines.map((id, i) => ({ id, name: prefix + i, module: "sale" })) });
    await prisma.pipeline_stages.createMany({ data: stages.map((id, i) => ({ id, name: prefix + "stage" + i + (i === 1 ? " (L2)" : ""), pipeline_id: pipelines[i === 3 ? 1 : 0], position: [10, 30, 50, 30][i] })) });
    await prisma.users.createMany({ data: users.map((id, i) => ({ id, email: prefix + i + "@example.test", full_name: "Người kiểm thử " + i, password_hash: "unused" })) });
    await prisma.roles.create({ data: { id: roleId, code: prefix, name: prefix } });
    const codes = ["report.personal.view", "report.personal.create", "report.personal.update", "report.personal.share", "report.personal.export", "report.view_all", "lead.view_all"];
    const permissions = await prisma.permissions.findMany({ where: { code: { in: codes }, is_active: true }, select: { id: true } }); assert.equal(permissions.length, codes.length);
    await prisma.role_permissions.createMany({ data: permissions.map((p) => ({ role_id: roleId, permission_id: p.id })) });
    await prisma.role_access_scopes.create({ data: { role_id: roleId, scope_code: "ALL" } });
    await prisma.role_institution_programs.createMany({ data: programs.map((id) => ({ role_id: roleId, institution_program_id: id })) });
    await prisma.user_program_roles.createMany({ data: programs.map((id) => ({ user_id: users[0]!, role_id: roleId, institution_program_id: id })) });
    await prisma.lead_sources.create({ data: { id: sourceId, name: prefix, institution_program_id: programs[0] } });
    await prisma.leads.createMany({ data: [0, 1, 2, 3, 1, 2].map((stage, i) => ({
      lead_code: prefix + i, full_name: prefix + i, phone: prefix + i, institution_program_id: programs[i < 4 ? 0 : 1],
      pipeline_stage_id: stages[stage], source_id: [0, 2, 4, 5].includes(i) ? sourceId : null, assigned_to: [0, 3, 4, 5].includes(i) ? users[0] : null, owner_id: users[0],
    })) });
    const createdA = await request(programs[0]!, "/reports/personal", "POST", input()); assert.equal(createdA.status, 201);
    const createdB = await request(programs[1]!, "/reports/personal", "POST", input()); assert.equal(createdB.status, 201);
    const reportA = createdA.body.id, reportB = createdB.body.id;
    const total = (result: any) => result.body.summary[0].value;
    assert.equal(total(await request(programs[0]!, "/reports/personal/" + reportA + "/result")), 4);
    assert.equal(total(await request(programs[1]!, "/reports/personal/" + reportB + "/result")), 2);
    for (const [programId, ownId, hiddenId] of [[programs[0], reportA, reportB], [programs[1], reportB, reportA]]) {
      const list = await request(programId!, "/reports/personal"); assert.equal(list.body.total, 1); assert.equal(list.body.items[0].id, ownId);
      assert.equal((await request(programId!, "/reports/personal/" + hiddenId + "/result")).status, 404);
      assert.equal((await request(programId!, "/reports/personal/" + hiddenId + "/export?format=csv")).status, 404);
      assert.equal((await request(programId!, "/reports/personal/" + hiddenId, "PATCH", input())).status, 404, "Cannot move report into another program");
      assert.equal((await request(programId!, "/reports/personal/" + hiddenId + "/sharing", "PATCH", { isShared: true })).status, 404);
      assert.equal((await request(programId!, "/reports/personal/" + hiddenId, "DELETE")).status, 404);
    }
    assert.equal((await request(randomUUID(), "/reports/personal")).status, 403);
    for (const [fieldKey, operator, expected] of [
      ["PIPELINE_STAGE", "GREATER_THAN_OR_EQUAL", 2], ["PIPELINE_STAGE", "LESS_THAN_OR_EQUAL", 2],
      ["ASSIGNEE", "IS_NOT_EMPTY", 2], ["ASSIGNEE", "IS_EMPTY", 2], ["SOURCE", "IS_NOT_EMPTY", 2], ["SOURCE", "IS_EMPTY", 2],
    ] as const) {
      const condition = { fieldKey, operator, ...(fieldKey === "PIPELINE_STAGE" ? { value: stages[1] } : {}) };
      const saved = await request(programs[0]!, "/reports/personal/" + reportA, "PATCH", input([condition])); assert.equal(saved.status, 200);
      assert.equal(total(await request(programs[0]!, "/reports/personal/" + reportA + "/result")), expected, operator + ": include boundary and exclude other pipelines/programs");
      assert.equal(saved.body.filters.conditions[0].operator, operator);
    }
    assert.equal((await request(programs[0]!, "/reports/personal", "POST", input([{ fieldKey: "SOURCE", operator: "LESS_THAN_OR_EQUAL", value: stages[1] }]))).status, 400);
    assert.equal((await request(programs[0]!, "/reports/personal", "POST", input([{ fieldKey: "PIPELINE_STAGE", operator: "IS_EMPTY" }]))).status, 400);
    assert.equal((await request(programs[0]!, "/reports/personal", "POST", input([{ fieldKey: "SOURCE", operator: "IS_EMPTY", value: "ignored" }]))).status, 400);
    for (const configuration of [
      { ...input([{ fieldKey: "PIPELINE_STAGE", operator: "LESS_THAN_OR_EQUAL", value: stages[1] }]), mode: "PIVOT", rowDimensionKey: "SOURCE", columnDimensionKey: "ASSIGNEE", expected: 2 },
      { ...input([{ fieldKey: "PIPELINE_STAGE", operator: "LESS_THAN_OR_EQUAL", value: stages[1] }]), datasetKey: "QUALIFIED_LEADS", expected: 1 },
      { ...input([{ fieldKey: "ASSIGNEE", operator: "IS_EMPTY" }]), datasetKey: "QUALIFIED_LEADS", expected: 2 },
    ]) {
      const saved = await request(programs[0]!, "/reports/personal/" + reportA, "PATCH", configuration);
      assert.equal(saved.status, 200);
      assert.equal(total(await request(programs[0]!, "/reports/personal/" + reportA + "/result")), configuration.expected);
    }
    const shared = await request(programs[0]!, "/reports/personal/" + reportA + "/sharing", "PATCH", { isShared: true }); assert.equal(shared.status, 200);
    assert.equal((await request(programs[1]!, "/reports/personal")).body.items.some((r: any) => r.id === reportA), false, "Shared reports remain program scoped");
    const kpi = (title: string, conditions: unknown[] = []) => ({ id: randomUUID(), title, type: "COUNT", datasetKey: "LEADS", conditions });
    const configA = { reportIds: [reportA], columnCount: 3, kpiWidgets: [kpi("KPI A", [{ fieldKey: "ASSIGNEE", operator: "IS_EMPTY" }])] };
    const configB = { reportIds: [reportB], columnCount: 1, kpiWidgets: [kpi("KPI B")] };
    assert.equal((await request(programs[0]!, "/reports/personal/dashboard/config", "PUT", { ...configA, reportIds: [reportB] })).status, 403);
    assert.equal((await request(programs[0]!, "/reports/personal/dashboard/config", "PUT", configA)).status, 200);
    assert.equal((await request(programs[1]!, "/reports/personal/dashboard/config", "PUT", configB)).status, 200);
    const dashA = await request(programs[0]!, "/reports/personal/dashboard"), dashB = await request(programs[1]!, "/reports/personal/dashboard");
    assert.equal(dashA.body.columnCount, 3); assert.equal(dashB.body.columnCount, 1);
    assert.equal(dashA.body.kpiWidgets[0].value, 2); assert.equal(dashB.body.kpiWidgets[0].value, 2);
    assert.equal(dashA.body.widgets[0].reportId, reportA); assert.equal(dashB.body.widgets[0].reportId, reportB);
    await prisma.personal_dashboard_widgets.create({ data: { user_id: users[0]!, institution_program_id: programs[0]!, personal_report_id: reportB, display_order: 2 } });
    assert.deepEqual((await request(programs[0]!, "/reports/personal/dashboard/config")).body.reportIds, [reportA], "Ignore legacy mismatched widgets");
    console.log("PASS: report list/read/edit/share/archive/export isolation, dashboard configuration/data isolation, inclusive pipeline comparisons, presence filters and invalid-condition rejection.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.audit_logs.deleteMany({ where: { user_id: { in: users } } });
    await prisma.leads.deleteMany({ where: { lead_code: { startsWith: prefix } } });
    await prisma.users.deleteMany({ where: { id: { in: users } } });
    await prisma.roles.delete({ where: { id: roleId } }).catch(() => undefined);
    await prisma.lead_sources.deleteMany({ where: { id: sourceId } });
    await prisma.pipeline_stages.deleteMany({ where: { id: { in: stages } } });
    await prisma.pipelines.deleteMany({ where: { id: { in: pipelines } } });
    await prisma.institution_programs.deleteMany({ where: { id: { in: programs } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
