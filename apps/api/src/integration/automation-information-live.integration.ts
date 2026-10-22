import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import express from "express";
import { hash } from "bcryptjs";
import type { AddressInfo } from "node:net";
import type { AutomationGraphData } from "../modules/automations/automation.types";
import { leadInformationSystemFields } from "../modules/leads/lead-information-field-catalog";

async function main() {
  for (const value of [process.env.DATABASE_URL!, process.env.REDIS_URL ?? "redis://localhost:6379"]) {
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname), "Live acceptance must use local services.");
  }
  const runId = randomUUID().slice(0, 8);
  const email = `automation-info-${runId}@example.test`;
  const password = randomUUID();
  const site = express();
  const server = site.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.NODE_ENV = "integration";
  process.env.WEB_ORIGIN = baseUrl;
  process.env.WEBHOOK_QUEUE_ENABLED = "false";
  process.env.AUTOMATION_QUEUE_NAME = `automation_info_live_${runId}`;
  process.env.AUTOMATION_PROCESS_ROLE = "all";
  delete process.env.DISABLE_AUTOMATION_WORKER;
  delete process.env.DISABLE_REDIS;
  const { prisma } = await import("../database/prisma.js");
  let engine: typeof import("../modules/automations/automation-engine.service.js") | undefined;
  let roleId: string | undefined, userId: string | undefined, leadId: string | undefined, ruleId: string | undefined;
  let groupId: string | undefined, fieldId: string | undefined;
  let temp: string | undefined;
  const sessionIds: string[] = [];
  try {
    // This test must not recover existing business jobs or run scheduled rules in the local database.
    assert.equal(await prisma.automation_rules.count({ where: { is_active: true, archived_at: null, trigger_type: { in: ["scheduled", "lead_unprocessed", "admission_profile_expiring"] } } }), 0, "Use the isolated test database when scheduled business rules are active.");
    assert.equal(await prisma.automation_jobs.count({ where: { status: { notIn: ["completed", "failed", "cancelled"] } } }), 0, "Existing pending jobs require isolated acceptance.");
    assert.equal(await prisma.automation_reassignment_monitors.count({ where: { status: { notIn: ["completed", "cancelled", "failed"] } } }), 0, "Existing monitors require isolated acceptance.");
    const program = await prisma.institution_programs.findFirstOrThrow({ where: { status: "active" } });
    const codes = ["automation.manage", "automation.view_logs", "lead.view_all", "lead.update_all", "lead.sensitive.view", "lead_activity.create"];
    const permissions = await prisma.permissions.findMany({ where: { code: { in: codes }, is_active: true } });
    assert.equal(permissions.length, codes.length, "Required permissions must already exist; do not alter business permission grants.");
    const role = await prisma.roles.create({ data: { code: `INFO_TEST_${runId}`, name: "Automation information acceptance fixture" } });
    roleId = role.id;
    await prisma.role_access_scopes.create({ data: { role_id: role.id, scope_code: "ALL" } });
    await prisma.role_permissions.createMany({ data: permissions.map((permission) => ({ role_id: role.id, permission_id: permission.id })) });
    await prisma.role_institution_programs.create({ data: { role_id: role.id, institution_program_id: program.id } });
    const user = await prisma.users.create({ data: { email, password_hash: await hash(password, 4), full_name: "Automation acceptance fixture", status: "active" } });
    userId = user.id;
    await prisma.user_program_roles.create({ data: { user_id: user.id, role_id: role.id, institution_program_id: program.id } });
    const lead = await prisma.leads.create({ data: { full_name: `INFO LIVE ${runId}`, phone: `09${String(Date.now()).slice(-8)}`, note: "Original fixture", assigned_to: user.id, owner_id: user.id, institution_program_id: program.id } });
    leadId = lead.id;
    const group = await prisma.custom_field_groups.create({ data: { entity_type: "LEAD", group_key: `info_live_${runId}`, group_label: "Acceptance fixture" } });
    groupId = group.id;
    const field = await prisma.custom_fields.create({ data: { module: "sale", entity_type: "LEAD", field_key: `score_${runId}`, field_label: "Điểm kiểm thử", field_type: "NUMBER", group_id: group.id, scope_type: "PROGRAM", program_id: program.id } });
    fieldId = field.id;
    const [{ authRouter }, { automationsRouter }, { build }] = await Promise.all([
      import("../modules/auth/auth.router.js"), import("../modules/automations/automations.router.js"), import("vite"),
    ]);
    engine = await import("../modules/automations/automation-engine.service.js");
    assert.ok(engine.automationWorker && engine.automationQueue, "Real Redis worker is required.");
    site.use(express.json());
    site.use("/api/auth", authRouter);
    site.use("/api/automations", automationsRouter);
    temp = await mkdtemp(resolve(tmpdir(), "crm-info-live-"));
    const outDir = resolve(temp, "dist");
    await build({ root: resolve("../web"), configFile: resolve("../web/vite.config.ts"), logLevel: "error", define: { "import.meta.env.VITE_API_URL": JSON.stringify("/api") }, build: { outDir, emptyOutDir: true } });
    site.use(express.static(outDir));
    site.get("/{*path}", (_request, response) => response.sendFile(resolve(outDir, "index.html")));
    site.use(((error, _request, response, _next) => { console.error(error.name, error.message); response.status(500).json({ message: "Acceptance request failed." }); }) as express.ErrorRequestHandler);
    const request = async (path: string, method = "GET", body?: unknown, token?: string) => {
      const response = await fetch(`${baseUrl}/api${path}`, { method, headers: { "Content-Type": "application/json", "X-Institution-Program-Id": program.id, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() as any };
    };
    assert.equal((await request("/automations/options")).status, 401);
    const login = await request("/auth/login", "POST", { email, password });
    assert.equal(login.status, 200);
    const accessToken = login.data.accessToken as string;
    const options = await request("/automations/options", "GET", undefined, accessToken);
    assert.equal(options.status, 200);
    assert.equal(options.data.writableFields.filter((entry: { source: string }) => entry.source === "system").length, leadInformationSystemFields.length);
    assert.ok(options.data.writableFields.find((entry: { reference: string }) => entry.reference === "system:pipelineStageId").readOnlyReason);
    assert.ok(options.data.writableFields.some((entry: { reference: string }) => entry.reference === `custom:${field.id}`));
    const graph: AutomationGraphData = {
      nodes: [
        { id: "trigger", type: "trigger", position: { x: 30, y: 80 }, data: { label: "Khởi động", triggerType: "lead_created" } },
        { id: "info", type: "action_update_information", position: { x: 280, y: 80 }, data: { label: "Cập nhật thông tin", informationUpdates: [{ id: "note", field: "system:note", operation: "set", value: "API verified" }, { id: "score", field: `custom:${field.id}`, operation: "set", value: 0 }, { id: "school", field: "system:highSchoolName", operation: "set", value: "API school" }, { id: "province", field: "system:province", operation: "set", value: "API province" }] } },
        { id: "after", type: "action_activity", position: { x: 530, y: 80 }, data: { label: "Sau cập nhật", activityType: "care", activityContent: `After info ${runId}` } },
      ], edges: [{ id: "start", source: "trigger", target: "info" }, { id: "next", source: "info", target: "after" }],
    };
    const created = await request("/automations", "POST", { name: `INFO ACCEPTANCE ${runId}`, triggerType: "lead_created", institutionProgramId: program.id, graphData: graph }, accessToken);
    assert.equal(created.status, 201); ruleId = created.data.id;
    assert.equal((await request(`/automations/${ruleId}`, "PATCH", { graphData: graph }, accessToken)).status, 200);
    const waitExecution = async (executionId: string) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        const log = await request(`/automations/${ruleId}/logs/${executionId}`, "GET", undefined, accessToken);
        assert.equal(log.status, 200);
        if (["completed", "failed"].includes(log.data.status)) { assert.equal(log.data.status, "completed", JSON.stringify(log.data)); return log.data; }
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error("Redis execution timed out.");
    };
    for (const expected of ["completed", "completed_no_change"]) {
      const run = await request(`/automations/${ruleId}/test-run`, "POST", { leadId: lead.id }, accessToken);
      assert.equal(run.status, 202);
      const log = await waitExecution(run.data.executionId);
      assert.equal(log.nodes.find((node: { nodeId: string }) => node.nodeId === "info").status, expected);
      assert.equal(log.nodes.find((node: { nodeId: string }) => node.nodeId === "after").status, "completed");
    }
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: lead.id } })).note, "API verified");
    assert.equal((await prisma.student_profiles.findUniqueOrThrow({ where: { lead_id: lead.id } })).high_school_name, "API school");
    assert.equal((await prisma.addresses.findFirstOrThrow({ where: { lead_id: lead.id, type: "current" } })).province, "API province");
    assert.equal(await prisma.audit_logs.count({ where: { entity_id: lead.id, action: "automation_update_information" } }), 1);
    assert.equal(Number((await prisma.custom_field_values.findFirstOrThrow({ where: { entity_id: lead.id, custom_field_id: field.id } })).value_number), 0);
    await new Promise<void>((done, reject) => {
      const child = spawn(process.execPath, [resolve("../web/tests/automation-information-live.browser.mjs")], {
        env: { ...process.env, INFO_ACCEPTANCE: JSON.stringify({ baseUrl, email, password, ruleId, leadName: lead.full_name, note: `UI verified ${runId}` }) }, windowsHide: true, stdio: "inherit",
      });
      const timer = setTimeout(() => { child.kill(); reject(new Error("Browser acceptance timed out.")); }, 90_000);
      child.once("exit", (code) => { clearTimeout(timer); code === 0 ? done() : reject(new Error(`Browser acceptance exited ${code}.`)); });
      child.once("error", reject);
    });
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: lead.id } })).note, `UI verified ${runId}`);
    assert.equal(await prisma.audit_logs.count({ where: { entity_id: lead.id, action: "automation_update_information" } }), 2);
    const invalid = structuredClone(graph);
    invalid.nodes[1].data.informationUpdates = [{ field: "system:fullName", operation: "clear" }];
    assert.equal((await request(`/automations/${ruleId}`, "PATCH", { graphData: invalid }, accessToken)).status, 422);
    const grant = permissions.find((entry) => entry.code === "lead.update_all")!;
    await prisma.role_permissions.delete({ where: { role_id_permission_id: { role_id: role.id, permission_id: grant.id } } });
    assert.equal((await request(`/automations/${ruleId}/test-run`, "POST", { leadId: lead.id }, accessToken)).status, 422);
    console.log("PASS: local database, session login, real options/save/reopen API, Redis worker, next node, no-change status, full application browser, audit deduplication and permission revocation.");
  } finally {
    if (engine) {
      await engine.automationWorker?.pause();
      await engine.automationQueue?.obliterate({ force: true });
      await engine.closeAutomationEngine();
    }
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    const { redisCommandConnection, redisConnection } = await import("../config/redis.js");
    await redisCommandConnection?.quit(); await redisConnection?.quit();
    if (userId) sessionIds.push(...(await prisma.auth_sessions.findMany({ where: { user_id: userId }, select: { id: true } })).map((session) => session.id));
    if (ruleId) await prisma.automation_rules.delete({ where: { id: ruleId } });
    if (leadId) { await prisma.custom_field_values.deleteMany({ where: { entity_id: leadId } }); await prisma.lead_activities.deleteMany({ where: { lead_id: leadId } }); await prisma.leads.delete({ where: { id: leadId } }); }
    if (fieldId) await prisma.custom_fields.delete({ where: { id: fieldId } });
    if (groupId) await prisma.custom_field_groups.delete({ where: { id: groupId } });
    await prisma.audit_logs.deleteMany({ where: { OR: [{ entity_id: { in: [ruleId, leadId, ...sessionIds].filter((id): id is string => Boolean(id)) } }, ...(userId ? [{ user_id: userId }] : [])] } });
    if (userId) { await prisma.auth_sessions.deleteMany({ where: { user_id: userId } }); await prisma.user_program_roles.deleteMany({ where: { user_id: userId } }); await prisma.users.delete({ where: { id: userId } }); }
    if (roleId) { await prisma.role_permissions.deleteMany({ where: { role_id: roleId } }); await prisma.role_institution_programs.deleteMany({ where: { role_id: roleId } }); await prisma.role_access_scopes.deleteMany({ where: { role_id: roleId } }); await prisma.roles.delete({ where: { id: roleId } }); }
    await prisma.$disconnect();
    if (temp?.startsWith(resolve(tmpdir(), "crm-info-live-"))) await rm(temp, { recursive: true, force: true });
  }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
