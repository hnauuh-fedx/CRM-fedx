import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { hash } from "bcryptjs";

import { prisma } from "../database/prisma";
import type { AuthUser } from "../modules/auth/auth.types";

const runId = randomUUID();
const sourceIds: string[] = [randomUUID(), randomUUID(), randomUUID()];
const leadIds: string[] = [randomUUID(), randomUUID(), randomUUID()];
const createdSourceIds: string[] = [];
const readOnlyUserId = randomUUID();
const readOnlyRoleId = randomUUID();
let server: import("node:http").Server | undefined;

async function verify() {
  process.env.NODE_ENV = "test";
  const { app } = await import("../app.js");
  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server!.once("listening", resolve);
    server!.once("error", reject);
  });
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "director@tvu.edu.vn", password: "123456" }),
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  const programsResponse = await fetch(`${base}/institution-programs/options`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(programsResponse.status, 200);
  const programs = (await programsResponse.json()).data as Array<{ id: string }>;
  assert.ok(programs.length >= 2, "Two accessible programs are required.");
  const [programA, programB] = programs;
  const viewPermission = await prisma.permissions.findUniqueOrThrow({ where: { code: "campaign.view_all" }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    await tx.users.create({ data: {
      id: readOnlyUserId,
      email: `source-viewer-${runId}@example.test`,
      full_name: "Lead source read-only fixture",
      password_hash: await hash(runId, 10),
      status: "active",
    } });
    await tx.roles.create({ data: { id: readOnlyRoleId, code: `SOURCE_TEST_${runId}`, name: "Lead source viewer fixture" } });
    await tx.role_permissions.create({ data: { role_id: readOnlyRoleId, permission_id: viewPermission.id } });
    await tx.role_institution_programs.create({ data: { role_id: readOnlyRoleId, institution_program_id: programA.id } });
    await tx.user_roles.create({ data: { user_id: readOnlyUserId, role_id: readOnlyRoleId } });
  });
  const types = [`scope-a-${runId}`, `scope-b-${runId}`, `scope-global-${runId}`];
  await prisma.lead_sources.createMany({ data: sourceIds.map((id, index) => ({
    id,
    name: `Scope fixture ${runId}`,
    type: types[index],
    institution_program_id: index === 0 ? programA.id : index === 1 ? programB.id : null,
  })) });
  // Include a legacy cross-program reference and a deleted lead to test counts.
  await prisma.leads.createMany({ data: leadIds.map((id, index) => ({
    id,
    full_name: `Scope fixture ${runId}`,
    phone: `test-${index}-${runId.slice(0, 8)}`,
    source_id: sourceIds[0],
    institution_program_id: index === 1 ? programB.id : programA.id,
    deleted_at: index === 2 ? new Date() : null,
  })) });

  async function request(path: string, programId: string, authenticated = true) {
    return fetch(`${base}${path}`, { headers: {
      ...(authenticated ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      "X-Institution-Program-Id": programId,
    } });
  }
  assert.equal((await request("/lead-sources", programA.id, false)).status, 401);
  assert.equal((await request("/lead-sources/options", randomUUID())).status, 403);
  assert.equal((await request("/lead-sources", "invalid-program")).status, 400);
  async function createSource(programId: string, body: unknown, token = session.accessToken) {
    return fetch(`${base}/lead-sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Institution-Program-Id": programId, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  }
  const validInput = { name: `New source ${runId}` };
  assert.equal((await createSource(programA.id, validInput, "")).status, 401);
  assert.equal((await createSource(randomUUID(), validInput)).status, 403);
  const readOnlyLogin = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `source-viewer-${runId}@example.test`, password: runId }),
  });
  assert.equal(readOnlyLogin.status, 200);
  const readOnlyToken = (await readOnlyLogin.json()).accessToken;
  const readOnlyList = await fetch(`${base}/lead-sources`, { headers: { Authorization: `Bearer ${readOnlyToken}`, "X-Institution-Program-Id": programA.id } });
  assert.equal(readOnlyList.status, 200);
  assert.equal((await createSource(programA.id, validInput, readOnlyToken)).status, 403);
  for (const invalid of [
    {},
    { name: "   " },
    { name: "x".repeat(151) },
    { name: "Website", type: "Website" },
    { ...validInput, institutionProgramId: programB.id },
  ]) {
    assert.equal((await createSource(programA.id, invalid)).status, 400);
  }
  for (const [index, program] of [programA, programB].entries()) {
    const response = await request(`/lead-sources?search=${runId}&limit=1&institutionProgramId=${index === 0 ? programB.id : programA.id}`, program.id);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.pagination.total, 1);
    assert.deepEqual(result.data.map((source: { id: string }) => source.id), [sourceIds[index]]);
    assert.equal(result.data[0].institutionProgram.id, program.id);
    assert.equal(result.data[0].activeLeadCount, index === 0 ? 1 : 0);
    const optionsResponse = await request("/lead-sources/options", program.id);
    assert.equal(optionsResponse.status, 200);
    const options = await optionsResponse.json();
    assert.ok(options.types.includes(types[index]));
    assert.ok(!options.types.includes(types[1 - index]));
    assert.ok(!options.types.includes(types[2]));
    assert.deepEqual(options.institutionPrograms.map((item: { id: string }) => item.id), [program.id]);
  }
  const typeResponse = await request(`/lead-sources?type=${types[1]}`, programA.id);
  assert.equal(typeResponse.status, 200);
  assert.equal((await typeResponse.json()).pagination.total, 0);
  // Identical names in two programs must create independent sources.
  for (const program of [programA, programB]) {
    const createdResponse = await createSource(program.id, { name: `  ${validInput.name}  ` });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    createdSourceIds.push(created.id);
    assert.equal(created.name, validInput.name);
    assert.equal(created.type, null);
    assert.equal(created.institutionProgramId, program.id);
    const persisted = await prisma.lead_sources.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(persisted.type, null);
    assert.equal(persisted.institution_program_id, program.id);
    const audits = await prisma.audit_logs.findMany({ where: { entity_type: "lead_source", entity_id: created.id, action: "create" }, select: { user_id: true, new_data: true } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].user_id, session.user.id);
    assert.equal((audits[0].new_data as { institutionProgramId: string }).institutionProgramId, program.id);
    const options = await request("/lead-sources/options", program.id);
    assert.ok((await options.json()).types.every((type: unknown) => typeof type === "string"));
  }
  assert.notEqual(createdSourceIds[0], createdSourceIds[1]);
  const newList = await request(`/lead-sources?search=${encodeURIComponent(validInput.name)}`, programA.id);
  const newSources = await newList.json();
  assert.equal(newSources.pagination.total, 1);
  assert.equal(newSources.data[0].id, createdSourceIds[0]);
  const { getLeadActionOptions } = await import("../modules/leads/application/get-lead-action-options.query.js");
  const { createLead, createLeadInTransaction } = await import("../modules/leads/application/create-lead.use-case.js");
  const { updateLead } = await import("../modules/leads/application/update-lead.use-case.js");
  const actor: AuthUser = { ...session.user, accessScope: "ALL" };
  const actionOptions = await getLeadActionOptions(actor, programA.id);
  const fixtureOptions = actionOptions.sources.filter((source) => sourceIds.includes(source.id));
  assert.deepEqual(fixtureOptions.map((source) => source.id), [sourceIds[0]]);
  for (const sourceId of [sourceIds[1], sourceIds[2]]) {
    const input = {
      fullName: `Scope fixture ${runId}`,
      phone: `test-new-${runId.slice(0, 8)}`,
      sourceId,
      institutionProgramId: programA.id,
    };
    assert.deepEqual(await createLead(actor, input), { ok: false, reason: "source_not_found" });
    assert.deepEqual(await updateLead(actor, leadIds[0], input, programA.id), { ok: false, reason: "source_not_found" });
  }
  assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: leadIds[0] }, select: { source_id: true } })).source_id, sourceIds[0]);
  const rollback = new Error("Roll back positive create fixture");
  await assert.rejects(prisma.$transaction(async (tx) => {
    const accepted = await createLeadInTransaction(tx, actor, {
      fullName: `Scope fixture ${runId}`,
      phone: `test-new-${runId.slice(0, 8)}`,
      sourceId: sourceIds[0],
      institutionProgramId: programA.id,
    });
    assert.equal(accepted.ok, true, "Source in the selected program must remain usable.");
    throw rollback;
  }), (error: unknown) => error === rollback);
  console.log("Verified lead-source creation and isolation: validation, write permission, audit, list/filter refresh, counts, pagination, authentication, program authorization, picker and cross-program lead-write rejection.");
  const inventory = await prisma.lead_sources.groupBy({ by: ["institution_program_id"], _count: { id: true }, where: { id: { notIn: [...sourceIds, ...createdSourceIds] } } });
  console.log("Existing source counts by program:", JSON.stringify(inventory));
}

verify().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  // Delete only the fixture IDs created by this run.
  await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.audit_logs.deleteMany({ where: { entity_type: "lead_source", entity_id: { in: createdSourceIds } } });
  await prisma.lead_sources.deleteMany({ where: { id: { in: [...sourceIds, ...createdSourceIds] } } });
  await prisma.audit_logs.deleteMany({ where: { user_id: readOnlyUserId } });
  await prisma.user_roles.deleteMany({ where: { user_id: readOnlyUserId } });
  await prisma.role_permissions.deleteMany({ where: { role_id: readOnlyRoleId } });
  await prisma.role_institution_programs.deleteMany({ where: { role_id: readOnlyRoleId } });
  await prisma.roles.deleteMany({ where: { id: readOnlyRoleId } });
  await prisma.users.deleteMany({ where: { id: readOnlyUserId } });
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});
