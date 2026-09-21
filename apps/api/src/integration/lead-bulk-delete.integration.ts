import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { redisConnection } from "../config/redis";
import { prisma } from "../database/prisma";
import type { AuthUser } from "../modules/auth/auth.types";
import { automationQueue, automationWorker } from "../modules/automations/automation-engine.service";
import { deleteLeads } from "../modules/leads/lead-management.service";

const runId = randomUUID().slice(0, 8);
const phoneSeed = Number.parseInt(runId, 16).toString().padStart(8, "0").slice(-8);
let actorId: string | null = null;
const leadIds: string[] = [];

async function cleanup() {
  if (leadIds.length > 0) {
    await prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: { in: leadIds } } });
    await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  }
  if (actorId) {
    await prisma.audit_logs.deleteMany({ where: { user_id: actorId } });
    await prisma.users.delete({ where: { id: actorId } });
  }
}

async function run() {
  const program = await prisma.institution_programs.findFirst({
    where: { status: "active" },
    select: { id: true },
  });
  assert.ok(program, "Cần một chương trình đang hoạt động để kiểm tra xóa lead hàng loạt.");

  const actorUser = await prisma.users.create({
    data: {
      email: `bulk-delete-actor-${runId}@example.test`,
      password_hash: "integration-only",
      full_name: "Bulk delete actor",
      status: "active",
    },
    select: { id: true, email: true, full_name: true, avatar_url: true },
  });
  actorId = actorUser.id;

  const createdLeads = await Promise.all([
    prisma.leads.create({
      data: {
        full_name: `Bulk delete lead A ${runId}`,
        phone: `07${phoneSeed}`,
        institution_program_id: program.id,
      },
      select: { id: true },
    }),
    prisma.leads.create({
      data: {
        full_name: `Bulk delete lead B ${runId}`,
        phone: `06${phoneSeed}`,
        institution_program_id: program.id,
      },
      select: { id: true },
    }),
  ]);
  leadIds.push(...createdLeads.map((lead) => lead.id));

  const actor: AuthUser = {
    id: actorUser.id,
    email: actorUser.email,
    fullName: actorUser.full_name,
    avatarUrl: actorUser.avatar_url,
    roles: [],
    permissions: ["lead.delete", "lead.view_all"],
    departmentIds: [],
    institutionProgramIds: [program.id],
    accessScope: "ALL",
  };

  const rejected = await deleteLeads(actor, [leadIds[0], randomUUID()], program.id);
  assert.equal(rejected.ok, false);
  assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: leadIds[0] } })).deleted_at, null);

  const deleted = await deleteLeads(actor, leadIds, program.id);
  assert.equal(deleted.ok, true);
  if (!deleted.ok) return;
  assert.equal(deleted.data.deletedCount, 2);

  const [leads, activityCount, auditCount] = await Promise.all([
    prisma.leads.findMany({ where: { id: { in: leadIds } }, select: { deleted_at: true } }),
    prisma.lead_activities.count({ where: { lead_id: { in: leadIds }, type: "lead_deleted" } }),
    prisma.audit_logs.count({ where: { entity_type: "lead", entity_id: { in: leadIds }, action: "delete" } }),
  ]);
  assert.equal(leads.every((lead) => lead.deleted_at !== null), true);
  assert.equal(activityCount, 2);
  assert.equal(auditCount, 2);

  console.log("Bulk lead deletion is atomic and records activities and audits.");
}

run()
  .finally(async () => {
    await cleanup();
    await automationWorker?.close();
    await automationQueue?.close();
    await redisConnection?.quit();
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
