import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import express from "express";
import { hash } from "bcryptjs";
import type { AutomationAssignmentResult } from "@admission-crm/shared/automation-assignment";
import type { AutomationGraphData } from "../modules/automations/automation.types";

async function main() {
  const database = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname));
  assert.equal(database.pathname, "/crm_db", "Acceptance targets the authorized local CRM database only.");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.REDIS_URL ?? "redis://localhost:6379").hostname));
  const useExistingServices = process.env.ASSIGNMENT_USE_EXISTING_CRM === "true";
  const runId = randomUUID().slice(0, 8), password = randomUUID();
  const email = `assignment-live-${runId}@example.test`;
  const site = express(), server = site.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.NODE_ENV = "integration";
  process.env.WEB_ORIGIN = baseUrl;
  process.env.WEBHOOK_QUEUE_ENABLED = "false";
  process.env.AUTOMATION_QUEUE_NAME = useExistingServices ? "automation_engine_queue" : `assignment_live_${runId}`;
  process.env.AUTOMATION_PROCESS_ROLE = useExistingServices ? "api" : "all";
  delete process.env.DISABLE_AUTOMATION_WORKER;
  delete process.env.DISABLE_REDIS;
  const { prisma } = await import("../database/prisma.js");
  const ruleIds: string[] = [], leadIds: string[] = [], userIds: string[] = [], roleIds: string[] = [];
  const evidence: object[] = [];
  let sourceId: string | undefined, temp: string | undefined;
  let pausedByAcceptance = false;
  let engine: typeof import("../modules/automations/automation-engine.service.js") | undefined;
  const artifact = resolve("../../artifacts/automation-assignment-conflict/readiness");
  await mkdir(artifact, { recursive: true });
  try {
    assert.equal(await prisma.automation_rules.count({ where: { is_active: true, archived_at: null, trigger_type: { in: ["scheduled", "lead_unprocessed", "admission_profile_expiring"] } } }), 0);
    assert.equal(await prisma.automation_jobs.count({ where: { status: { notIn: ["completed", "failed", "cancelled"] } } }), 0);
    assert.equal(await prisma.automation_reassignment_monitors.count({ where: { status: { notIn: ["completed", "cancelled", "failed"] } } }), 0);
    const program = await prisma.institution_programs.findFirstOrThrow({ where: { status: "active" }, select: { id: true } });
    const programId = program.id;
    const codes = ["automation.manage", "automation.view_logs", "lead.view_all", "lead.create", "lead.assign", "lead.sensitive.view"];
    const permissions = await prisma.permissions.findMany({ where: { code: { in: [...codes, "lead.view_assigned"] }, is_active: true } });
    assert.equal(permissions.length, codes.length + 1, "Use existing permissions; never edit business grants.");
    const managerRole = await prisma.roles.create({ data: { code: `ASSIGN_MANAGER_${runId}`, name: "Kiểm thử phân công" } }); roleIds.push(managerRole.id);
    const saleRole = await prisma.roles.create({ data: { code: `ASSIGN_SALE_${runId}`, name: "Sale kiểm thử" } }); roleIds.push(saleRole.id);
    await prisma.role_access_scopes.createMany({ data: [{ role_id: managerRole.id, scope_code: "ALL" }, { role_id: saleRole.id, scope_code: "ASSIGNED_ONLY" }] });
    await prisma.role_institution_programs.createMany({ data: roleIds.map((role_id) => ({ role_id, institution_program_id: programId })) });
    await prisma.role_permissions.createMany({ data: permissions.map((p) => ({ role_id: p.code === "lead.view_assigned" ? saleRole.id : managerRole.id, permission_id: p.id })) });
    const users = [];
    for (const [index, full_name] of ["Quản lý kiểm thử", "Sale A kiểm thử", "Sale B kiểm thử"].entries()) {
      const user = await prisma.users.create({ data: { email: index ? `assignment-live-${runId}-${index}@example.test` : email, password_hash: await hash(password, 4), full_name } });
      userIds.push(user.id); users.push(user);
      await prisma.user_program_roles.create({ data: { user_id: user.id, role_id: index ? saleRole.id : managerRole.id, institution_program_id: programId } });
    }
    const [manager, saleA, saleB] = users;
    const source = await prisma.lead_sources.create({ data: { name: `ASSIGN LIVE ${runId}`, institution_program_id: programId } }); sourceId = source.id;
    const [{ authRouter }, { automationsRouter }, { leadsRouter }, { personalNotificationsRouter }, { institutionProgramsRouter }, { build }] = await Promise.all([
      import("../modules/auth/auth.router.js"), import("../modules/automations/automations.router.js"), import("../modules/leads/leads.router.js"), import("../modules/notifications/personal-notifications.router.js"), import("../modules/institutions/institution-programs.router.js"), import("vite"),
    ]);
    engine = await import("../modules/automations/automation-engine.service.js");
    assert.ok(engine.automationQueue && (useExistingServices || engine.automationWorker));
    if (useExistingServices) {
      assert.equal(await engine.automationQueue.getActiveCount(), 0, "Existing local queue must be idle before acceptance");
      assert.equal(await engine.automationQueue.isPaused(), false, "Do not override an existing manual queue pause");
    }
    site.use(express.json()); site.use("/api/auth", authRouter); site.use("/api/automations", automationsRouter); site.use("/api/leads", leadsRouter); site.use("/api/notifications", personalNotificationsRouter); site.use("/api/institution-programs", institutionProgramsRouter);
    site.use("/api", (_request, response) => response.status(404).json({ message: "API route not mounted in acceptance server" }));
    if (!useExistingServices) {
    temp = await mkdtemp(resolve(tmpdir(), "crm-assignment-live-"));
    const dist = resolve(temp, "dist");
    await build({ root: resolve("../web"), configFile: resolve("../web/vite.config.ts"), logLevel: "error", define: { "import.meta.env.VITE_API_URL": JSON.stringify("/api") }, build: { outDir: dist, emptyOutDir: true } });
    site.use(express.static(dist)); site.get("/{*path}", (_request, response) => response.sendFile(resolve(dist, "index.html")));
    }
    site.use(((error, _request, response, _next) => { console.error(error.name, error.message); response.status(500).json({ message: "Acceptance failed" }); }) as express.ErrorRequestHandler);
    const request = async (path: string, method = "GET", body?: unknown, token?: string) => {
      const response = await fetch((useExistingServices ? "http://localhost:3000" : baseUrl) + "/api" + path, { signal: AbortSignal.timeout(15_000), method, headers: { "Content-Type": "application/json", "X-Institution-Program-Id": programId!, ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() as any };
    };
    assert.equal((await request("/automations/observability/executions")).status, 401);
    const login = await request("/auth/login", "POST", { email, password }); assert.equal(login.status, 200);
    const token: string = login.data.accessToken;
    assert.equal((await request("/institution-programs/options", "GET", undefined, token)).status, 200);
    assert.equal((await request("/notifications", "GET", undefined, token)).status, 200);
    const graph = (saleId: string): AutomationGraphData => ({ nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Lead mới", triggerType: "lead_created" } },
      { id: "condition", type: "condition", position: { x: 250, y: 0 }, data: { label: "Lead kiểm thử", field: "system:fullName", operator: "contains", value: runId } },
      { id: "assign", type: "action_assign", position: { x: 500, y: 0 }, data: { label: "Gán Sale", assignToUserId: saleId } },
    ], edges: [{ id: "start", source: "trigger", target: "condition" }, { id: "match", source: "condition", target: "assign", sourceHandle: "default" }] });
    const graphs = [graph(saleA.id), graph(saleB.id)];
    for (const [index, graphData] of graphs.entries()) {
      const created = await request("/automations", "POST", { name: `ASSIGN LIVE ${runId} Rule ${index ? "B" : "A"}`, triggerType: "lead_created", institutionProgramId: programId, graphData }, token);
      assert.equal(created.status, 201); ruleIds.push(created.data.id);
      assert.equal((await request(`/automations/${created.data.id}/toggle`, "PATCH", { isActive: true }, token)).status, 200);
    }
    const until = async <T,>(read: () => Promise<T>, valid: (value: T) => boolean): Promise<T> => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) { const value = await read(); if (valid(value)) return value; await new Promise((done) => setTimeout(done, 50)); }
      throw new Error("Acceptance timeout");
    };
    let browserConfig: object | undefined;
    for (const variant of ["direct", "pool"] as const) {
      if (variant === "pool") {
        assert.equal((await request(`/automations/${ruleIds[1]}/toggle`, "PATCH", { isActive: false }, token)).status, 200);
        graphs[1].nodes[2] = { id: "assign", type: "action_assign_pool", position: { x: 500, y: 0 }, data: { label: "Chia Lead", assignmentStrategy: "round_robin", assigneeIds: [saleB.id] } };
        assert.equal((await request(`/automations/${ruleIds[1]}`, "PATCH", { graphData: graphs[1] }, token)).status, 200);
        assert.equal((await request(`/automations/${ruleIds[1]}/toggle`, "PATCH", { isActive: true }, token)).status, 200);
      }
      await engine.automationQueue.pause(); pausedByAcceptance = true;
      const leadName = `ASSIGN LIVE ${runId} ${variant}`;
      // Fixture creation deliberately emits no business event. Only these two
      // rules are tested through the real API, leaving active CRM rules untouched.
      const fixture = await prisma.leads.create({ data: { full_name: leadName, phone: `09${String(Date.now()).slice(-8)}`, source_id: source.id, institution_program_id: programId, owner_id: manager.id } });
      const leadId = fixture.id; leadIds.push(leadId);
      const started = await Promise.all(ruleIds.map((id) => request(`/automations/${id}/test-run`, "POST", { leadId }, token)));
      for (const run of started) assert.equal(run.status, 202, JSON.stringify(run.data));
      const logs = await until(() => prisma.automation_execution_logs.findMany({ where: { id: { in: started.map((run) => run.data.executionId) } } }), (rows) => rows.length === 2);
      await engine.automationQueue.resume(); pausedByAcceptance = false;
      await until(() => prisma.automation_execution_logs.findMany({ where: { id: { in: logs.map((log) => log.id) } } }), (rows) => rows.every((row) => row.status === "completed" || row.status === "failed"));
      const details = await Promise.all(logs.map((log) => request(`/automations/observability/executions/${log.id}`, "GET", undefined, token)));
      for (const detail of details) { assert.equal(detail.status, 200); assert.equal(detail.data.status, "completed", JSON.stringify(detail.data)); }
      const outcomes = details.map((detail) => ({ log: detail.data, node: detail.data.nodes.find((node: any) => node.nodeId === "assign") }));
      assert.deepEqual(outcomes.map((entry) => entry.node.assignmentResult.kind).sort(), ["assigned", "conflict"]);
      const winner = outcomes.find((entry) => entry.node.assignmentResult.kind === "assigned")!;
      const conflict = outcomes.find((entry) => entry.node.assignmentResult.kind === "conflict")!;
      const result = conflict.node.assignmentResult as AutomationAssignmentResult;
      assert.equal(result.source?.ruleId, winner.log.rule.id);
      assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: leadId } })).assigned_to, result.currentAssigneeId);
      assert.equal(await prisma.lead_assignments.count({ where: { lead_id: leadId } }), 1);
      assert.equal(await prisma.audit_logs.count({ where: { entity_id: leadId, action: "automation_assignment_completed" } }), 1);
      assert.equal(await prisma.audit_logs.count({ where: { entity_id: leadId, action: "automation_assignment_skipped" } }), 1);
      assert.equal(await prisma.notifications.count({ where: { user_id: { in: userIds }, type: "lead_assignment", content: { contains: leadName } } }), 1);
      const audits = await prisma.audit_logs.count({ where: { entity_id: leadId } });
      const { executeRegisteredAutomationNode } = await import("../modules/automations/automation-action-registry.js");
      for (const entry of outcomes) {
        const index = ruleIds.indexOf(entry.log.rule.id);
        await Promise.all([1, 2].map(() => executeRegisteredAutomationNode(graphs[index].nodes[2], { ruleId: entry.log.rule.id, actorId: manager.id, leadId, institutionProgramId: programId }, entry.node.id)));
      }
      assert.equal(await prisma.audit_logs.count({ where: { entity_id: leadId } }), audits);
      if (variant === "pool" && conflict.log.rule.id === ruleIds[1]) assert.equal(await prisma.automation_assignment_cursors.count({ where: { rule_id: ruleIds[1] } }), 0);
      evidence.push({ variant, leadId, winnerRuleId: winner.log.rule.id, conflictRuleId: conflict.log.rule.id, outcome: result, executions: logs.map((log) => log.id) });
      console.log(`PASS: live CRM concurrent API test-runs -> two matching rules -> Redis -> one owner, one conflict (${variant}); duplicate deliveries preserved`);
      browserConfig = { baseUrl: useExistingServices ? "http://localhost:5173" : baseUrl, email, password, ruleId: conflict.log.rule.id, winnerRuleId: winner.log.rule.id, ruleName: conflict.log.rule.name, winnerRuleName: winner.log.rule.name, leadName, saleName: result.currentAssigneeName };
    }
    await new Promise<void>((done, reject) => {
      const child = spawn(process.execPath, [resolve("../web/tests/automation-assignment-live.browser.mjs")], { env: { ...process.env, ASSIGNMENT_ACCEPTANCE: JSON.stringify(browserConfig) }, windowsHide: true, stdio: "inherit" });
      const timer = setTimeout(() => { child.kill(); reject(new Error("Browser acceptance timeout")); }, 90_000);
      child.once("exit", (code) => { clearTimeout(timer); code === 0 ? done() : reject(new Error("Browser acceptance failed: " + code)); });
      child.once("error", reject);
    });
    await writeFile(resolve(artifact, "live-evidence.json"), JSON.stringify({ testedAt: new Date().toISOString(), database: "crm_db", existingServices: useExistingServices, queue: process.env.AUTOMATION_QUEUE_NAME, cases: evidence }, null, 2));
  } finally {
    if (engine) { if (pausedByAcceptance) await engine.automationQueue?.resume(); await engine.automationWorker?.pause(); if (!useExistingServices) await engine.automationQueue?.obliterate({ force: true }); await engine.closeAutomationEngine(); }
    server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done()));
    if (engine) {
      const { redisConnection, redisCommandConnection } = await import("../config/redis.js");
      for (const connection of [redisCommandConnection, redisConnection]) { if (connection) await connection.quit().catch(() => connection.disconnect()); }
    }
    const sessionIds = (await prisma.auth_sessions.findMany({ where: { user_id: { in: userIds } }, select: { id: true } })).map((session) => session.id);
    // Only exact IDs created by this run are removed; existing CRM records are never selected.
    await prisma.automation_rules.deleteMany({ where: { id: { in: ruleIds } } });
    await prisma.lead_activities.deleteMany({ where: { lead_id: { in: leadIds } } });
    await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.notifications.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { entity_id: { in: [...ruleIds, ...leadIds, ...sessionIds] } }] } });
    if (sourceId) await prisma.lead_sources.delete({ where: { id: sourceId } });
    await prisma.auth_sessions.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user_program_roles.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role_permissions.deleteMany({ where: { role_id: { in: roleIds } } });
    await prisma.role_institution_programs.deleteMany({ where: { role_id: { in: roleIds } } });
    await prisma.role_access_scopes.deleteMany({ where: { role_id: { in: roleIds } } });
    await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
    const remaining = await prisma.users.count({ where: { id: { in: userIds } } }) + await prisma.leads.count({ where: { id: { in: leadIds } } }) + await prisma.automation_rules.count({ where: { id: { in: ruleIds } } });
    assert.equal(remaining, 0);
    await writeFile(resolve(artifact, "live-cleanup.json"), JSON.stringify({ runId, remainingFixtureRecords: remaining, cleanedAt: new Date().toISOString() }, null, 2));
    await prisma.$disconnect();
    if (temp) { assert.ok(temp.startsWith(resolve(tmpdir(), "crm-assignment-live-"))); await rm(temp, { recursive: true, force: true }); }
  }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
