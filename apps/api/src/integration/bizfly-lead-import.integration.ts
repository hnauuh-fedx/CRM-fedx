import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { prisma } from "../database/prisma";
import { getAuthUser } from "../modules/auth/auth.service";
import { getFailedLeadStageId, toLeadLifecycleStatus } from "../modules/leads/domain/lead-lifecycle-status";

process.env.NODE_ENV = "test";

async function main() {
const { importBizflyRows } = await import("../modules/leads/bizfly-lead-import.service.js");
  const director = await prisma.users.findUniqueOrThrow({ where: { email: "director@tvu.edu.vn" }, select: { id: true } });
  const actor = await getAuthUser(director.id);
  assert.ok(actor);
  assert.ok(actor.permissions.includes("lead.assign"));
  const programId = actor.institutionProgramIds[0];
  assert.ok(programId);
  const staff = await prisma.users.findFirstOrThrow({ where: { status: "active", deleted_at: null,
    user_roles: { some: { roles: {
      role_institution_programs: { some: { institution_program_id: programId } },
      role_permissions: { some: { permissions: { code: "lead.view_assigned" } },
        none: { permissions: { code: { in: ["lead.view_department", "lead.view_all"] } } } },
    } } },
  }, select: { id: true, email: true } });
  const marker = `Kiểm thử Bizfly ${randomUUID()}`;
  const phones = [0, 1].map(() => `09${randomInt(10_000_000, 100_000_000)}`);
  const rollback = new Error("ROLLBACK_BIZFLY_TEST");
  try {
    await prisma.$transaction(async (tx) => {
      const source = await tx.lead_sources.create({ data: { name: marker, institution_program_id: programId }, select: { name: true } });
      // Use one outer transaction; every fixture is rolled back, including notes/audit/major.
      const database = { ...tx, $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
        await tx.$executeRawUnsafe("SAVEPOINT bizfly_test_row");
        try {
          const result = await callback(tx);
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT bizfly_test_row");
          return result;
        } catch (error) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT bizfly_test_row");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT bizfly_test_row");
          throw error;
        }
      } } as unknown as typeof prisma;
      const values = { fullName: marker, sourceName: source.name, majorName: marker, stageName: "Đăng ký học (L3)",
        assigneeEmail: ` ${staff.email.toUpperCase()} `, note: "Ghi chú kiểm thử", email: "import-test@example.com", createdAt: "13:26:51 07/10/2026" };
      const result = await importBizflyRows(actor, phones.map((phone, index) => ({ row: index + 3, values: { ...values, phone } })), programId, undefined, database);
      assert.deepEqual(result.errors, []);
      assert.equal(result.importedRows, 2);
      const failed = await importBizflyRows(actor, [{ row: 5, values: { ...values, phone: `08${randomInt(10_000_000, 100_000_000)}`, stageName: "Fail" } }], programId, undefined, database);
      assert.deepEqual(failed.errors, []);
      assert.equal(failed.importedRows, 1);
      const leads = await tx.leads.findMany({ where: { institution_program_id: programId, full_name: marker },
        select: { id: true, status: true, pipeline_stage_id: true, assigned_to: true, created_at: true, note: true, major_id: true, pipeline_stages: { select: { name: true } } }, orderBy: { status: "asc" } });
      assert.equal(leads.length, 3);
      assert.equal(leads[0].assigned_to, staff.id);
      assert.equal(leads[0].created_at?.toISOString(), "2026-10-07T06:26:51.000Z");
      assert.equal(leads[0].note, values.note);
      assert.match(leads[0].pipeline_stages!.name, /L4/);
      assert.equal(leads[0].major_id, leads[1].major_id);
      const failedLead = leads.find((lead) => toLeadLifecycleStatus(lead.status).value === "FAIL");
      assert.ok(failedLead);
      assert.match(failedLead.pipeline_stages!.name, /L0/);
      assert.equal(getFailedLeadStageId(failedLead.status), failedLead.pipeline_stage_id);
      assert.equal(await tx.majors.count({ where: { institution_program_id: programId, name: marker } }), 1);
      const ids = leads.map((lead) => lead.id);
      assert.equal(await tx.lead_assignments.count({ where: { lead_id: { in: ids } } }), 0);
      assert.equal(await tx.lead_activities.count({ where: { lead_id: { in: ids }, type: "lead_assigned" } }), 0);
      assert.equal(await tx.audit_logs.count({ where: { entity_id: { in: ids }, action: "assign" } }), 0);
      assert.equal(await tx.notifications.count({ where: { content: { contains: marker } } }), 0);
      const duplicate = await importBizflyRows(actor, [{ row: 8, values: { ...values, phone: phones[0], majorName: `${marker} rejected` } }], programId, undefined, database);
      assert.equal(duplicate.failedRows, 1);
      assert.equal(await tx.majors.count({ where: { name: `${marker} rejected` } }), 0);
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await prisma.leads.count({ where: { full_name: marker } }), 0);
  assert.equal(await prisma.majors.count({ where: { name: { startsWith: marker } } }), 0);
  console.log("Bizfly DB integration passed; all fixtures rolled back.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
