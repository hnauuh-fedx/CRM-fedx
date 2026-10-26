import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";
import { prisma } from "../database/prisma";

type LookupResponse = {
  data: Array<{ id: string; fullName: string; type: string; canOpenDetail: boolean; assignee: { id: string } | null }>;
  pagination: { total: number };
};

async function run() {
  process.env.DISABLE_AUTOMATION_WORKER = "true";
  process.env.DISABLE_REDIS = "true";
  const marker = `lookup-test-${randomUUID()}`;
  const password = randomUUID();
  const actorId = randomUUID();
  const otherId = randomUUID();
  const roleId = randomUUID();
  const ownLeadId = randomUUID();
  const otherLeadId = randomUUID();
  const studentLeadId = randomUUID();
  const phoneSuffix = String(Date.now()).slice(-8);
  const otherPhone = `09${phoneSuffix}`;
  const otherEmail = `${marker}-other@example.test`;
  let server: ReturnType<typeof import("node:http").createServer> | undefined;
  const stage = await prisma.pipeline_stages.findFirst({ select: { id: true } });
  assert.ok(stage, "A pipeline stage must exist");
  const program = await prisma.institution_programs.findFirst({ select: { id: true } });
  assert.ok(program, "An institution program must exist");
  try {
    await prisma.users.createMany({ data: [
      { id: actorId, full_name: `${marker}-actor`, email: `${marker}-actor@example.test`, password_hash: await hash(password, 4) },
      { id: otherId, full_name: `${marker}-other`, email: `${marker}-other-user@example.test`, password_hash: "test-unused" },
    ] });
    await prisma.roles.create({ data: { id: roleId, code: marker, name: marker } });
    const permissions = await prisma.permissions.findMany({
      where: { code: { in: ["customer_lookup.view", "lead.view_assigned"] } },
      select: { id: true, code: true },
    });
    assert.equal(permissions.length, 2, "customer_lookup.view must be seeded by migration");
    await prisma.role_permissions.createMany({ data: permissions.map((p) => ({ role_id: roleId, permission_id: p.id })) });
    await prisma.role_access_scopes.create({ data: { role_id: roleId, scope_code: "ASSIGNED_ONLY" } });
    await prisma.role_institution_programs.create({ data: { role_id: roleId, institution_program_id: program.id } });
    await prisma.user_program_roles.create({ data: { user_id: actorId, role_id: roleId, institution_program_id: program.id } });
    const base = { status: "active", pipeline_stage_id: stage.id, institution_program_id: program.id };
    await prisma.leads.create({ data: { ...base, id: ownLeadId, full_name: `${marker} A`, phone: `08${phoneSuffix}`, assigned_to: actorId } });
    await prisma.leads.create({ data: { ...base, id: otherLeadId, full_name: `${marker} B`, phone: otherPhone, email: otherEmail, cccd: "079000000001", assigned_to: otherId } });
    await prisma.leads.create({ data: { ...base, id: studentLeadId, full_name: `${marker} C`, phone: `07${phoneSuffix}`, assigned_to: actorId } });
    await prisma.students.create({ data: { lead_id: studentLeadId, student_code: marker, status: "active" } });

    const { app } = await import("../app.js");
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const url = `${api}/sale/customer-lookup`;
    const login = await fetch(`${api}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${marker}-actor@example.test`, password }),
    });
    assert.equal(login.status, 200);
    const token: string = (await login.json()).accessToken;
    const headers = { Authorization: `Bearer ${token}`, "X-Institution-Program-Id": program.id };
    const lookup = async (query: string) => {
      const response = await fetch(`${url}?${query}`, { headers });
      assert.equal(response.status, 200);
      const text = await response.text();
      return { text, body: JSON.parse(text) as LookupResponse };
    };

    assert.equal((await fetch(url)).status, 401);

    const all = await lookup(`search=${marker}&sortBy=fullName&sortOrder=asc`);
    assert.equal(all.body.pagination.total, 3, "Lookup ignores the assigned-only lead scope");
    assert.deepEqual(all.body.data.map((item) => item.id), [ownLeadId, otherLeadId, studentLeadId]);
    assert.ok(!all.text.includes(otherPhone) && !all.text.includes(otherEmail) && !all.text.includes("079000000001"), "Sensitive fields are never serialized");
    for (const item of all.body.data) {
      assert.deepEqual(Object.keys(item).sort(), ["assignee", "canOpenDetail", "createdAt", "fullName", "id", "source", "type", "updatedAt"]);
    }
    const byId = new Map(all.body.data.map((item) => [item.id, item]));
    assert.equal(byId.get(ownLeadId)?.canOpenDetail, true, "Own assigned candidate opens");
    assert.equal(byId.get(otherLeadId)?.canOpenDetail, false, "Out-of-scope lead does not open");
    assert.equal(byId.get(studentLeadId)?.type, "student");
    assert.equal(byId.get(studentLeadId)?.canOpenDetail, false, "Student detail still needs student permission");

    // Drop the leading zero only; "9" + suffix is unique to the out-of-scope lead.
    const byPartialPhone = await lookup(`search=${otherPhone.slice(1)}`);
    assert.deepEqual(byPartialPhone.body.data.map((item) => item.id), [otherLeadId], "Partial phone search works");
    assert.equal((await lookup(`search=${encodeURIComponent(otherEmail.slice(0, -5))}`)).body.data[0]?.id, otherLeadId, "Partial email search works");
    assert.equal((await lookup(`search=${marker}&type=students`)).body.pagination.total, 1);
    assert.equal((await lookup(`search=${marker}&type=candidates`)).body.pagination.total, 2);
    assert.deepEqual((await lookup(`search=${marker}&assigneeId=${otherId}`)).body.data.map((item) => item.id), [otherLeadId]);
    assert.equal((await fetch(`${url}?sortBy=phone`, { headers })).status, 400);
    assert.equal((await fetch(`${url}/options`, { headers })).status, 200);

    await prisma.role_permissions.deleteMany({ where: { role_id: roleId, permission_id: permissions.find((p) => p.code === "customer_lookup.view")!.id } });
    assert.equal((await fetch(`${url}?search=${marker}`, { headers })).status, 403, "Lookup requires explicit permission");
    assert.equal((await fetch(`${url}/options`, { headers })).status, 403);
    console.log("Customer lookup: permission, unscoped listing, sensitive-field omission, search, filters, sorting and detail access passed.");
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await prisma.students.deleteMany({ where: { lead_id: studentLeadId } });
    await prisma.leads.deleteMany({ where: { id: { in: [ownLeadId, otherLeadId, studentLeadId] } } });
    const sessionIds = (await prisma.auth_sessions.findMany({ where: { user_id: actorId }, select: { id: true } })).map((session) => session.id);
    await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: actorId }, { entity_id: { in: sessionIds } }] } });
    await prisma.auth_sessions.deleteMany({ where: { user_id: actorId } });
    await prisma.users.deleteMany({ where: { id: { in: [actorId, otherId] } } });
    await prisma.roles.deleteMany({ where: { id: roleId } });
    await prisma.$disconnect();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
