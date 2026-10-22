import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AutomationInformationUpdate } from "@admission-crm/shared/automation-information-update";
import type { AutomationNode } from "../modules/automations/automation.types";
import { leadInformationSystemFields, informationReadOnlyReasons } from "../modules/leads/lead-information-field-catalog";

process.env.NODE_ENV = "test";
const token = randomUUID().slice(0, 8);
const leadIds: string[] = [], fieldIds: string[] = [], ruleIds: string[] = [];
let groupId: string | undefined;
async function main() {
const [{ prisma }, { getAuthUser }, { getLeadWritableFields, updateLeadInformationInTransaction }, { executeRegisteredAutomationNode }, { updateAutomationRule }] = await Promise.all([
  import("../database/prisma.js"),
  import("../modules/auth/auth.service.js"),
  import("../modules/leads/lead-information-update.service.js"),
  import("../modules/automations/automation-action-registry.js"),
  import("../modules/automations/automation.service.js"),
]);
try {
  const user = await prisma.users.findUniqueOrThrow({ where: { email: "director@tvu.edu.vn" }, select: { id: true } });
  const principal = await getAuthUser(user.id);
  assert.ok(principal?.institutionProgramIds.length);
  const programId = principal.institutionProgramIds[0];
  const actor = await getAuthUser(user.id, programId);
  assert.ok(actor);
  assert.ok(actor.permissions.includes("lead.update_all"), "Fixture requires a lead.update_all principal.");
  const phone = `09${String(Date.now()).slice(-8)}`;
  for (let index = 0; index < 2; index++) {
    const lead = await prisma.leads.create({ data: { full_name: `Information ${token}`, phone: index ? `08${phone.slice(2)}` : phone, institution_program_id: programId, assigned_to: actor.id, owner_id: actor.id, note: "Trước" } });
    leadIds.push(lead.id);
  }
  const group = await prisma.custom_field_groups.create({ data: { group_key: `information_${token}`, group_label: "Information test", entity_type: "LEAD" } });
  groupId = group.id;
  for (const [key, type] of [["number", "NUMBER"], ["boolean", "BOOLEAN"], ["choice", "MULTI_SELECT"], ...["TEXT", "TEXTAREA", "DATE", "DATETIME", "PHONE", "EMAIL", "SELECT", "PROVINCE", "FILE"].map((type) => [type.toLowerCase(), type])]) {
    const field = await prisma.custom_fields.create({ data: { module: "sale", field_key: `${key}_${token}`, field_label: key, field_type: type, entity_type: "LEAD", scope_type: "PROGRAM", program_id: programId, group_id: group.id, options: ["MULTI_SELECT", "SELECT"].includes(type) ? [{ code: "a", label: "A", isActive: true }, { code: "retired", label: "Retired", isActive: false }] : [] } });
    fieldIds.push(field.id);
  }
  const updates: AutomationInformationUpdate[] = [
    { field: "system:fullName", operation: "set", value: "Tên đã cập nhật" },
    { field: "system:email", operation: "set", value: "TEST@example.test" },
    { field: "system:note", operation: "clear" },
    { field: `custom:${fieldIds[0]}`, operation: "set", value: 0 },
    { field: `custom:${fieldIds[1]}`, operation: "set", value: false },
    { field: `custom:${fieldIds[2]}`, operation: "set", value: ["a"] },
  ];
  const run = (changes: unknown, who = actor, id = leadIds[0], program = programId) => prisma.$transaction((tx) => updateLeadInformationInTransaction(tx, who, id, changes, program));
  const count = () => prisma.audit_logs.count({ where: { entity_id: leadIds[0] } });
  assert.equal((await run(updates)).changedFields.length, 6);
  const changed = await prisma.leads.findUniqueOrThrow({ where: { id: leadIds[0] } });
  assert.equal(changed.full_name, "Tên đã cập nhật");
  assert.equal(changed.note, null);
  assert.equal(changed.email, "test@example.test");
  assert.equal(changed.phone, phone);
  const stored = await prisma.custom_field_values.findMany({ where: { entity_id: leadIds[0] } });
  assert.equal(Number(stored.find((row) => row.custom_field_id === fieldIds[0])?.value_number), 0);
  assert.equal(stored.find((row) => row.custom_field_id === fieldIds[1])?.value_boolean, false);
  const auditCount = await count();
  assert.deepEqual((await run(updates)).changedFields, []);
  assert.equal(await count(), auditCount, "No-op must not add audits.");
  const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_id: leadIds[0], action: "automation_update_information" } });
  assert.ok(!JSON.stringify(audit).includes("test@example.test"), "Sensitive audit values must be redacted.");

  await assert.rejects(run([{ field: "system:note", operation: "set", value: "Không được lưu" }, { field: `custom:${fieldIds[2]}`, operation: "set", value: ["retired"] }]));
  assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: leadIds[0] } })).note, null);
  await assert.rejects(run([{ field: "system:fullName", operation: "clear" }]));
  await assert.rejects(run([{ field: "system:dateOfBirth", operation: "set", value: "2026-02-30" }]));
  await assert.rejects(run([{ field: "system:phone", operation: "set", value: `08${phone.slice(2)}` }]));
  await assert.rejects(run(updates, { ...actor, permissions: actor.permissions.filter((permission) => !permission.startsWith("lead.update")) }));
  await assert.rejects(run(updates, { ...actor, accessScope: "READ_ONLY" }));
  await assert.rejects(run(updates, { ...actor, id: randomUUID(), permissions: actor.permissions.filter((permission) => !permission.startsWith("lead.update")).concat("lead.update_assigned") }));
  await assert.rejects(run(updates, { ...actor, institutionProgramIds: [], workingInstitutionProgramId: null }));
  await assert.rejects(run([{ field: "system:email", operation: "set", value: "other@example.test" }], { ...actor, permissions: actor.permissions.filter((permission) => permission !== "lead.sensitive.view") }));
  const catalog = await getLeadWritableFields(actor, programId);
  assert.equal(catalog.filter((field) => field.source === "system").length, leadInformationSystemFields.length);
  for (const key of Object.keys(informationReadOnlyReasons)) {
    assert.ok(catalog.find((field) => field.reference === `system:${key}`)?.readOnlyReason);
    await assert.rejects(run([{ field: `system:${key}`, operation: "set", value: randomUUID() }]));
  }
  await prisma.custom_fields.update({ where: { id: fieldIds[0] }, data: { is_active: false } });
  await assert.rejects(run([{ field: `custom:${fieldIds[0]}`, operation: "set", value: 5 }]));
  await prisma.custom_fields.update({ where: { id: fieldIds[0] }, data: { is_active: true } });
  if (principal.institutionProgramIds[1]) {
    await prisma.custom_fields.update({ where: { id: fieldIds[0] }, data: { program_id: principal.institutionProgramIds[1] } });
    await assert.rejects(run([{ field: `custom:${fieldIds[0]}`, operation: "set", value: 5 }]));
    await prisma.custom_fields.update({ where: { id: fieldIds[0] }, data: { program_id: programId } });
  }
  await prisma.custom_fields.update({ where: { id: fieldIds[0] }, data: { is_required: true } });
  await assert.rejects(run([{ field: `custom:${fieldIds[0]}`, operation: "clear" }]));
  await prisma.custom_fields.update({ where: { id: fieldIds[0] }, data: { is_required: false } });

  // Force a failure after the writer finishes: all data AND custom-field audits must roll back.
  await assert.rejects(prisma.$transaction(async (tx) => {
    await updateLeadInformationInTransaction(tx, actor, leadIds[0], [{ field: "system:note", operation: "set", value: "Rollback" }, { field: `custom:${fieldIds[0]}`, operation: "set", value: 99 }], programId);
    throw new Error("checkpoint failure");
  }));
  assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: leadIds[0] } })).note, null);
  assert.equal(await count(), auditCount);

  // Exercise every writable system field, all twelve custom types and partial updates.
  const values: Record<string, unknown> = { TEXT: "Extended", TEXTAREA: "Extended details", NUMBER: 8.5, BOOLEAN: false, DATE: "2025-01-02", DATETIME: "2025-01-02T10:30:00.000Z", PHONE: phone, EMAIL: "extended@example.test", SELECT: "a", PROVINCE: "da_nang", FILE: [{ name: "fixture.pdf", url: "https://example.test/fixture.pdf", size: 100, type: "application/pdf", lastModified: 0 }], STRING_LIST: [`tag-${token}`], MULTI_SELECT: ["a"] };
  const extended = catalog.filter((field) => !field.readOnlyReason).map((field): AutomationInformationUpdate => {
    let value = values[field.dataType];
    if (field.dataType === "SELECT") value = field.options[0]?.code;
    if (field.key === "graduationYear") value = 2025;
    if (field.key === "leadScore") value = 10;
    if (field.key === "secondaryPhones") value = [`07${phone.slice(2)}`];
    return { field: field.reference, operation: "set", value: value as AutomationInformationUpdate["value"] };
  });
  assert.ok(extended.length > 50, "Catalogue must exceed the old six fields and fifty-row cap.");
  assert.equal(new Set(catalog.filter((field) => field.source === "custom").map((field) => field.dataType)).size, 12);
  assert.equal((await run(extended)).changedFields.length, extended.length - 3, "Existing primary phone, false and choice remain unchanged.");
  assert.deepEqual((await run(extended)).changedFields, []);
  const profile = await prisma.student_profiles.findUniqueOrThrow({ where: { lead_id: leadIds[0] } });
  assert.equal(profile.graduation_year, 2025);
  assert.equal(profile.high_school_name, "Extended");
  const admission = await prisma.admission_profiles.findUniqueOrThrow({ where: { lead_id: leadIds[0] } });
  assert.equal(Number(admission.score_1), 8.5);
  assert.equal(admission.admission_status_id, null);
  await run([{ field: "system:ward", operation: "set", value: "New ward" }, { field: "system:relative1Job", operation: "set", value: "New job" }, { field: "system:trainingCode", operation: "clear" }]);
  const address = await prisma.addresses.findFirstOrThrow({ where: { lead_id: leadIds[0], type: "current" } });
  assert.equal(address.ward, "New ward");
  assert.equal(address.province, "Extended");
  const relative = await prisma.relatives.findFirstOrThrow({ where: { lead_id: leadIds[0], is_primary: true } });
  assert.equal(relative.full_name, "Extended");
  assert.equal(relative.job, "New job");
  assert.equal((await prisma.admission_profiles.findUniqueOrThrow({ where: { lead_id: leadIds[0] } })).class_code, "Extended");
  await assert.rejects(run([{ field: "system:classCode", operation: "set", value: "Forbidden" }], { ...actor, permissions: actor.permissions.filter((permission) => permission !== "admission.update") }));
  await assert.rejects(run([{ field: "system:ward", operation: "set", value: "Rollback ward" }, { field: "system:relative2Phone", operation: "set", value: "invalid" }]));
  assert.equal((await prisma.addresses.findUniqueOrThrow({ where: { id: address.id } })).ward, "New ward");
  console.log(`PASS: all ${leadInformationSystemFields.length} system fields visible; ${extended.length} writable system/custom fields, 12 custom types, partial preservation, no-op and workflow/permission guards.`);

  const rule = await prisma.automation_rules.create({ data: { name: `Information ${token}`, trigger_type: "lead_created", graph_data: { nodes: [], edges: [] }, created_by: actor.id, institution_program_id: programId } });
  ruleIds.push(rule.id);
  const execution = await prisma.automation_execution_logs.create({ data: { rule_id: rule.id, execution_actor_id: actor.id, status: "processing" } });
  const node: AutomationNode = { id: "information", type: "action_update_information", position: { x: 0, y: 0 }, data: { label: "Cập nhật", informationUpdates: [{ field: "system:note", operation: "set", value: "Đã chạy node" }] } };
  const invalidSave = await updateAutomationRule(actor, rule.id, { graphData: { nodes: [{ ...node, data: { ...node.data, informationUpdates: [{ field: "system:fullName", operation: "clear" }] } }], edges: [] } });
  assert.ok(invalidSave && !invalidSave.ok && invalidSave.reason === "invalid_information_update");
  const save = await updateAutomationRule(actor, rule.id, { graphData: { nodes: [node], edges: [] } });
  assert.ok(save?.ok);
  const saved = await prisma.automation_rules.findUniqueOrThrow({ where: { id: rule.id } });
  assert.deepEqual((saved.graph_data as { nodes: unknown[] }).nodes[0], node);
  const nodeExecution = await prisma.automation_node_executions.create({ data: { execution_log_id: execution.id, node_id: node.id, node_type: node.type } });
  const context = { ruleId: rule.id, actorId: actor.id, leadId: leadIds[0], institutionProgramId: programId };
  const beforeExecution = await count();
  await Promise.all([
    executeRegisteredAutomationNode(node, context, nodeExecution.id),
    executeRegisteredAutomationNode(node, context, nodeExecution.id),
  ]);
  assert.equal(await count(), beforeExecution + 1, "Concurrent deliveries must write one audit.");
  assert.equal((await prisma.automation_node_executions.findUniqueOrThrow({ where: { id: nodeExecution.id } })).status, "action_completed");
  await executeRegisteredAutomationNode(node, context, nodeExecution.id);
  assert.equal(await count(), beforeExecution + 1, "Retry must reuse the action checkpoint.");
  const unchangedExecution = await prisma.automation_node_executions.create({ data: { execution_log_id: execution.id, node_id: "unchanged", node_type: node.type } });
  assert.equal((await executeRegisteredAutomationNode({ ...node, id: "unchanged" }, context, unchangedExecution.id)).noChange, true);
  assert.equal((await prisma.automation_node_executions.findUniqueOrThrow({ where: { id: unchangedExecution.id } })).status, "action_completed_no_change");
  assert.equal((await executeRegisteredAutomationNode({ ...node, id: "unchanged" }, context, unchangedExecution.id)).noChange, true);
  assert.equal(await count(), beforeExecution + 1);
  console.log("PASS: typed updates, clear, no-op, audit redaction, permissions, scope, invalid dates, duplicate phones, retired fields/options, rollback, save/reopen, concurrent deliveries and retry.");
} finally {
  await prisma.automation_rules.deleteMany({ where: { id: { in: ruleIds } } });
  await prisma.audit_logs.deleteMany({ where: { entity_id: { in: [...leadIds, ...ruleIds] } } });
  await prisma.custom_field_values.deleteMany({ where: { custom_field_id: { in: fieldIds } } });
  await prisma.custom_fields.deleteMany({ where: { id: { in: fieldIds } } });
  if (groupId) await prisma.custom_field_groups.delete({ where: { id: groupId } });
  await prisma.lead_activities.deleteMany({ where: { lead_id: { in: leadIds } } });
  await prisma.entity_tags.deleteMany({ where: { entity_type: "lead", entity_id: { in: leadIds } } });
  await prisma.tags.deleteMany({ where: { name: `tag-${token}` } });
  await prisma.relatives.deleteMany({ where: { lead_id: { in: leadIds } } });
  await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.$disconnect();
}
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
