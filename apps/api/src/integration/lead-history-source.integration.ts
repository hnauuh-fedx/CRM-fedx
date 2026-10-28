import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma";
import { getAuthUser } from "../modules/auth/auth.service";
import { applyInboundLeadMutation } from "../modules/leads/lead-inbound.service";
import { getLeadDetail } from "../modules/leads/lead-list.service";
import { executeRegisteredAutomationNode } from "../modules/automations/automation-action-registry";
import { withHistorySource } from "../database/history-source";

async function run() {
  const program = await prisma.institution_programs.findFirstOrThrow();
  const creator = await prisma.users.findFirstOrThrow({ where: { email: "director@tvu.edu.vn" } });
  const role = await prisma.roles.findUniqueOrThrow({ where: { code: "DIRECTOR" } });
  await prisma.user_program_roles.createMany({ data: { user_id: creator.id, institution_program_id: program.id, role_id: role.id }, skipDuplicates: true });
  const actor = await getAuthUser(creator.id, program.id);
  assert.ok(actor);
  const lead = await prisma.leads.create({ data: { full_name: "History test", phone: "0891234567", institution_program_id: program.id } });
  const rule = await prisma.automation_rules.create({ data: { name: "Chia Lead tự động", trigger_type: "lead_created", graph_data: { nodes: [], edges: [] }, created_by: actor.id, institution_program_id: program.id } });
  try {
    const result = await applyInboundLeadMutation({
      actor, institutionProgramId: program.id, duplicatePolicy: "UPDATE_EXISTING",
      leadInput: { fullName: "Webhook updated", phone: lead.phone, sourceId: "" },
      providedFields: new Set(["fullName", "phone"]), customFieldValues: [], canCreate: true,
      creationSource: { channel: "webhook", webhookName: "Form nhận Lead", webhookId: randomUUID(), requestId: randomUUID() },
    });
    assert.ok(result.ok);
    const execution = await prisma.automation_execution_logs.create({ data: { rule_id: rule.id } });
    const node = { id: "activity", type: "action_activity" as const, position: { x: 0, y: 0 }, data: { label: "Ghi hoạt động", activityType: "other", activityContent: "Tự động chăm sóc" } };
    const nodeExecution = await prisma.automation_node_executions.create({ data: { execution_log_id: execution.id, node_id: node.id, node_type: node.type } });
    await executeRegisteredAutomationNode(node, { ruleId: rule.id, actorId: actor.id, institutionProgramId: program.id, leadId: lead.id }, nodeExecution.id);
    const manual = await prisma.lead_activities.create({ data: { lead_id: lead.id, user_id: actor.id, type: "other", content: "Thao tác trực tiếp" } });
    const manualAudit = await prisma.audit_logs.create({ data: { entity_type: "lead", entity_id: lead.id, user_id: actor.id, action: "update", new_data: { fullName: "Manual" } } });
    const legacy = await prisma.lead_activities.create({ data: { lead_id: lead.id, user_id: actor.id, type: "automation_reassignment" } });
    const detail = await getLeadDetail(actor, lead.id, program.id);
    assert.ok(detail);
    assert.equal(detail.activities.find((row) => row.type === "lead_updated")?.actorLabel, "API / Webhook · Form nhận Lead");
    assert.equal(detail.recentChanges.find((row) => row.action === "webhook_update")?.actorLabel, "API / Webhook · Form nhận Lead");
    assert.equal(detail.activities.find((row) => row.content === "Tự động chăm sóc")?.actorLabel, "Hệ thống · Automation: Chia Lead tự động");
    assert.equal(detail.recentChanges.find((row) => row.action === "automation_activity_created")?.actorLabel, "Hệ thống · Automation: Chia Lead tự động");
    assert.equal(detail.activities.find((row) => row.id === manual.id)?.actorLabel, undefined);
    assert.equal(detail.activities.find((row) => row.id === manual.id)?.actor?.id, actor.id);
    assert.equal(detail.activities.find((row) => row.id === legacy.id)?.actorLabel, "Hệ thống · Automation");
    assert.equal(detail.recentChanges.find((row) => row.id === manualAudit.id)?.description, "Cập nhật: Họ và tên");
    const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_id: lead.id, action: "webhook_update" } });
    assert.equal(audit.user_id, actor.id, "Keep responsible principal for auditing");
    const automated = await prisma.lead_activities.findFirstOrThrow({ where: { lead_id: lead.id, content: "Tự động chăm sóc" } });
    assert.equal(automated.user_id, actor.id);
    await assert.rejects(withHistorySource({ channel: "automation", name: "Rollback" }, () => prisma.$transaction(async (tx) => {
      await tx.lead_activities.create({ data: { lead_id: lead.id, type: "other", content: "Must rollback" } });
      throw new Error("Rollback");
    })));
    assert.equal(await prisma.lead_activities.count({ where: { lead_id: lead.id, content: "Must rollback" } }), 0);
    console.log("PASS history source: inbound update, automation action, both tabs, manual user, legacy, responsible principal, transaction rollback.");
  } finally {
    await prisma.audit_logs.deleteMany({ where: { entity_id: lead.id } });
    await prisma.leads.delete({ where: { id: lead.id } });
    await prisma.automation_rules.delete({ where: { id: rule.id } });
    await prisma.$disconnect();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
