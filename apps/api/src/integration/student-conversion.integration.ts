import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma";
import type { AuthUser } from "../modules/auth/auth.types";
import { changeStudentMembership } from "../modules/students/student-conversion.service";
import { getLeadDetail, listLeads, type LeadListQuery } from "../modules/leads/lead-list.service";
import { getOverviewReport } from "../modules/reports/report-overview.service";
import { saveAdmissionProfile } from "../modules/admissions/admission-profile-write.service";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import { env } from "../config/env";

async function run() {
  process.env.DISABLE_AUTOMATION_WORKER = "true";
  process.env.DISABLE_REDIS = "true";
  const id = randomUUID();
  const actorId = randomUUID();
  const roleId = randomUUID();
  let server: ReturnType<typeof import("node:http").createServer> | undefined;
  const marker = `conversion-test-${id}`;
  const stage = await prisma.pipeline_stages.findFirst({ select: { id: true } });
  assert.ok(stage, "A pipeline stage must exist");
  const program = await prisma.institution_programs.findFirst({ select: { id: true } });
  assert.ok(program, "An institution program must exist");
  const actor: AuthUser = {
    id: actorId, email: `${marker}@example.test`, fullName: marker, avatarUrl: null, roles: [],
    permissions: ["lead.view_all", "student.view_all", "student.convert_from_lead", "student.revert_to_candidate"],
    departmentIds: [], institutionProgramIds: [program.id], accessScope: "ALL",
  };
  const query: LeadListQuery = { page: 1, limit: 20, search: marker, sortBy: "createdAt", sortOrder: "desc", institutionProgramId: program.id };
  try {
    await prisma.users.create({ data: { id: actorId, full_name: marker, email: actor.email, password_hash: "test-unused" } });
    await prisma.roles.create({ data: { id: roleId, code: marker, name: marker } });
    const permissions = await prisma.permissions.findMany({ where: { code: { in: actor.permissions } }, select: { id: true, code: true } });
    await prisma.role_permissions.createMany({ data: permissions.map((p) => ({ role_id: roleId, permission_id: p.id })) });
    await prisma.role_access_scopes.create({ data: { role_id: roleId, scope_code: "ALL" } });
    await prisma.role_institution_programs.create({ data: { role_id: roleId, institution_program_id: program.id } });
    await prisma.user_program_roles.create({ data: { user_id: actorId, role_id: roleId, institution_program_id: program.id } });
    const { app } = await import("../app.js");
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const token = jwt.sign({ sub: actorId, type: "access" }, env.JWT_SECRET, { expiresIn: 300 });
    const headers = { Authorization: `Bearer ${token}`, "X-Institution-Program-Id": program.id, "Content-Type": "application/json" };
    await prisma.leads.create({ data: { id, full_name: marker, lead_code: marker, phone: "0000000000", status: "active",
      pipeline_stage_id: stage.id, institution_program_id: program.id } });
    const initialReport = await getOverviewReport(program.id);
    assert.equal((await changeStudentMembership({ ...actor, permissions: ["lead.view_all"] }, id, "student", program.id)).ok, false);
    assert.equal((await changeStudentMembership({ ...actor, accessScope: "ASSIGNED_ONLY" }, id, "student", program.id)).ok, false);
    assert.equal((await changeStudentMembership(actor, id, "student", randomUUID())).ok, false);
    const attempts = await Promise.all([
      changeStudentMembership(actor, id, "student", program.id),
      changeStudentMembership(actor, id, "student", program.id),
    ]);
    assert.equal(attempts.filter((result) => result.ok).length, 1, "Concurrent conversion creates one student");
    const student = await prisma.students.findUniqueOrThrow({ where: { lead_id: id } });
    assert.ok(student.admission_profile_id);
    assert.equal((await listLeads(actor, { ...query, audience: "candidates" })).pagination.total, 0);
    assert.equal((await listLeads(actor, { ...query, audience: "students" })).pagination.total, 1);
    assert.equal((await listLeads(actor, { ...query, audience: "all" })).pagination.total, 1, "Marketing retains the record");
    assert.equal(await getLeadDetail({ ...actor, permissions: ["lead.view_all"] }, id, program.id), null);
    assert.equal((await getLeadDetail(actor, id, program.id))?.recordType, "student");
    assert.equal((await fetch(`${base}/leads/${id}`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/leads/${id}`, { headers, method: "PATCH", body: "{}" })).status, 403, "Lead writes need student update permission");
    assert.equal((await fetch(`${base}/leads/bulk-delete`, { headers, method: "POST", body: JSON.stringify({ leadIds: [id] }) })).status, 403);
    assert.equal((await fetch(`${base}/leads/${id}/membership`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "candidate" }) })).status, 401);
    const view = permissions.find((p) => p.code === "student.view_all")!;
    await prisma.role_permissions.deleteMany({ where: { role_id: roleId, permission_id: view.id } });
    assert.equal((await fetch(`${base}/leads/${id}`, { headers })).status, 403, "Saved lead URL cannot bypass student visibility");
    assert.equal((await fetch(`${base}/leads?audience=students`, { headers })).status, 403);
    const marketing = await fetch(`${base}/leads?audience=all&search=${marker}`, { headers });
    assert.equal(marketing.status, 200);
    assert.equal((await marketing.json()).pagination.total, 1);
    await prisma.role_permissions.create({ data: { role_id: roleId, permission_id: view.id } });
    const admission = await prisma.admission_profiles.findUniqueOrThrow({ where: { lead_id: id } });
    const enrolledStatus = await prisma.admission_statuses.findUniqueOrThrow({ where: { code: "ENROLLED" } });
    assert.equal(admission.admission_status_id, enrolledStatus.id);
    const major = await prisma.majors.findFirst({ where: { OR: [{ institution_program_id: program.id }, { institution_program_id: null }] } });
    if (major) {
      await prisma.$transaction((tx) => saveAdmissionProfile(tx, id, { institutionProgramId: program.id, majorId: major.id, admissionStatusId: enrolledStatus.id }));
      assert.equal((await prisma.students.findUniqueOrThrow({ where: { lead_id: id } })).major_id, major.id);
    }
    const enrolledReport = await getOverviewReport(program.id);
    assert.equal(enrolledReport.summary.totalLeads, initialReport.summary.totalLeads);
    assert.equal(enrolledReport.summary.totalStudents, initialReport.summary.totalStudents + 1);
    const service = await prisma.student_services.create({ data: { student_id: student.id, content: marker, type: "test" } });
    assert.equal((await fetch(`${base}/leads/${id}/membership`, { headers, method: "POST", body: JSON.stringify({ target: "candidate" }) })).status, 200,
      "Explicit reverse permission works independently of ordinary edit permission");
    assert.equal((await listLeads(actor, { ...query, audience: "candidates" })).pagination.total, 1);
    assert.equal((await listLeads(actor, { ...query, audience: "students" })).pagination.total, 0);
    assert.equal((await listLeads(actor, { ...query, audience: "all" })).pagination.total, 1);
    const lead = await prisma.leads.findUniqueOrThrow({ where: { id } });
    assert.equal(lead.pipeline_stage_id, stage.id);
    assert.equal(lead.status, "active");
    assert.equal((await prisma.admission_profiles.findUniqueOrThrow({ where: { lead_id: id } })).admission_status_id, null);
    assert.ok(await prisma.student_services.findUnique({ where: { id: service.id } }), "Service history survives returning to candidate");
    assert.equal((await getOverviewReport(program.id)).summary.totalStudents, initialReport.summary.totalStudents);
    assert.equal((await changeStudentMembership(actor, id, "student", program.id)).ok, true);
    assert.equal((await prisma.students.findUniqueOrThrow({ where: { lead_id: id } })).id, student.id);
    assert.equal(await prisma.audit_logs.count({ where: { entity_type: "lead", entity_id: id } }), 3);
    console.log("Student conversion: permissions, scope, concurrency, all lists, reports, pipeline and retained history passed.");
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await prisma.student_services.deleteMany({ where: { students: { is: { lead_id: id } } } });
    await prisma.students.deleteMany({ where: { lead_id: id } });
    await prisma.admission_profiles.deleteMany({ where: { lead_id: id } });
    await prisma.audit_logs.deleteMany({ where: { entity_id: id, user_id: actorId } });
    await prisma.notifications.deleteMany({ where: { user_id: actorId } });
    await prisma.leads.deleteMany({ where: { id } });
    await prisma.users.deleteMany({ where: { id: actorId } });
    await prisma.roles.deleteMany({ where: { id: roleId } });
    await prisma.$disconnect();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
