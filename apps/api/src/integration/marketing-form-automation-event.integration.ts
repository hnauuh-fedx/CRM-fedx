import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "../database/prisma";
import type { AuthUser } from "../modules/auth/auth.types";
import {
  createMarketingFormAutomationEvent,
  dispatchMarketingFormAutomationEvent,
  recoverMarketingFormAutomationEvents,
} from "../modules/automations/marketing-form-automation-event.service";

const ruleId = randomUUID();
const eventId = randomUUID();
const rolledBackEventId = randomUUID();
const formId = randomUUID();
const submittedEventIds: string[] = [];
const userId = randomUUID();
const leadId = randomUUID();

async function run() {
  process.env.DISABLE_REDIS = "true";
  process.env.DISABLE_AUTOMATION_WORKER = "true";
  const program = await prisma.institution_programs.findFirstOrThrow({ where: { status: "active" }, select: { id: true } });
  await prisma.automation_rules.create({
    data: {
      id: ruleId,
      institution_program_id: program.id,
      name: `[TEST] Form event recovery ${eventId}`,
      trigger_type: "survey_completed",
      is_active: true,
      graph_data: { nodes: [{ id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Khảo sát hoàn thành", triggerType: "survey_completed" } }], edges: [] },
    },
  });

  const payload = {
    triggerType: "survey_completed" as const,
    submissionId: eventId,
    formId: randomUUID(),
    institutionProgramId: program.id,
    configurationVersion: "fixture-v1",
    leadId: null,
    actorId: null,
    answers: { satisfaction: "5", note: "Fixture only" },
  };
  await assert.rejects(prisma.$transaction(async (tx) => {
    await createMarketingFormAutomationEvent(tx, { ...payload, submissionId: rolledBackEventId });
    throw new Error("rollback fixture");
  }), /rollback fixture/);
  assert.equal(await prisma.automation_jobs.count({ where: { id: rolledBackEventId } }), 0, "Rolled-back submissions must not emit automation events.");
  const first = await prisma.$transaction((tx) => createMarketingFormAutomationEvent(tx, payload));
  const replay = await prisma.$transaction((tx) => createMarketingFormAutomationEvent(tx, payload));
  assert.equal(first, eventId);
  assert.equal(replay, eventId);
  assert.equal(await prisma.automation_jobs.count({ where: { id: eventId, type: "marketing_form_event" } }), 1);

  const unavailable = await dispatchMarketingFormAutomationEvent(eventId, async () => ({ matched: 1, started: 0, failed: 0, unavailable: true }));
  assert.equal(unavailable.ok, false);
  assert.equal((await prisma.automation_jobs.findUniqueOrThrow({ where: { id: eventId } })).status, "failed");

  await prisma.automation_jobs.update({ where: { id: eventId }, data: { run_at: new Date(Date.now() - 1_000) } });
  const calls: Array<{ triggerType: string; context: Record<string, unknown>; eventId: string }> = [];
  const recovered = await recoverMarketingFormAutomationEvents(100, async (triggerType, context, options) => {
    calls.push({ triggerType, context, eventId: options.eventId });
    return { matched: 1, started: 1, failed: 0, unavailable: false };
  }, [eventId]);
  assert.deepEqual(recovered, { scanned: 1, completed: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].triggerType, "survey_completed");
  assert.equal(calls[0].eventId, eventId);
  assert.equal(calls[0].context.marketingFormSubmissionId, eventId);
  assert.equal(calls[0].context.leadId, undefined);
  assert.equal((await prisma.automation_jobs.findUniqueOrThrow({ where: { id: eventId } })).status, "completed");

  const duplicateDelivery = await dispatchMarketingFormAutomationEvent(eventId, async () => {
    throw new Error("A completed event must not be dispatched twice.");
  });
  assert.deepEqual(duplicateDelivery, { ok: true, claimed: false });

  process.env.DISABLE_AUTOMATION_WORKER = "true";
  const publicKey = `g6-event-${randomUUID()}`;
  await prisma.marketing_forms.create({
    data: {
      id: formId,
      institution_program_id: program.id,
      name: `[TEST] G6 survey ${eventId}`,
      public_key: publicKey,
      status: "active",
      form_type: "survey",
      duplicate_settings: { submissionMode: "survey_only", submissionPolicyVersion: 1, updatePolicy: "fill_empty", overwriteFields: [] },
      marketing_form_fields: { create: [{ field_key: "satisfaction", label: "Mức độ hài lòng", field_type: "rating", is_active: true, is_required: true, validation_rules: { ratingMax: 5 } }] },
    },
  });
  const { submitMarketingForm } = await import("../modules/campaigns/marketing-form-public.service.js");
  const submission = await submitMarketingForm({ publicKey, payload: { satisfaction: "5" }, idempotencyKey: randomUUID() });
  assert.ok(submission.ok);
  submittedEventIds.push(submission.data.submissionId);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = await prisma.automation_jobs.findUniqueOrThrow({ where: { id: submission.data.submissionId } });
    if (job.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const submittedJob = await prisma.automation_jobs.findUniqueOrThrow({ where: { id: submission.data.submissionId } });
  assert.equal(submittedJob.type, "marketing_form_event");
  assert.equal(submittedJob.status, "failed", "Queue outage must not roll back a valid public submission.");
  const submittedPayload = submittedJob.payload as Record<string, unknown>;
  assert.equal(submittedPayload.triggerType, "survey_completed");
  assert.equal(submittedPayload.formId, formId);
  assert.equal(submittedPayload.leadId, null);
  assert.deepEqual(submittedPayload.answers, { satisfaction: "5" });
  await prisma.users.create({ data: { id: userId, email: `g6-${userId}@example.test`, password_hash: "fixture-only", full_name: "G6 fixture", status: "active" } });
  await prisma.leads.create({ data: { id: leadId, full_name: "G6 fixture lead", phone: "0900000000", institution_program_id: program.id, assigned_to: userId } });
  const actor: AuthUser = {
    id: userId, email: `g6-${userId}@example.test`, fullName: "G6 fixture", avatarUrl: null,
    roles: [], permissions: ["lead.assign", "lead.view_all"], accessScope: "ALL", departmentIds: [],
    institutionProgramIds: [program.id], workingInstitutionProgramId: program.id,
  };
  const { assignVisibleLead } = await import("../modules/leads/application/lead-owner-stage.use-cases.js");
  const preserved = await assignVisibleLead(actor, leadId, {
    skipIfAssigned: true,
    resolveAssigneeId: async () => { throw new Error("Existing ownership must be checked before advancing an assignment pool."); },
  }, program.id);
  assert.ok(preserved.ok);
  assert.equal(preserved.data.assigneeId, userId);
  assert.equal(await prisma.lead_assignments.count({ where: { lead_id: leadId } }), 0);
  assert.equal(await prisma.lead_activities.count({ where: { lead_id: leadId } }), 0);
  assert.equal(await prisma.audit_logs.count({ where: { entity_id: leadId } }), 0);
  assert.equal((await assignVisibleLead({ ...actor, permissions: ["lead.view_all"] }, leadId, { skipIfAssigned: true }, program.id)).ok, false);
  assert.equal((await assignVisibleLead(actor, leadId, { skipIfAssigned: true }, randomUUID())).ok, false);
  const { executeRegisteredAutomationNode } = await import("../modules/automations/automation-action-registry.js");
  const eventContext = { ruleId, actorId: userId, institutionProgramId: program.id, marketingFormSubmissionId: eventId, payload: { answers: { satisfaction: "5" } } };
  await assert.rejects(executeRegisteredAutomationNode({
    id: "condition", type: "condition", position: { x: 0, y: 0 },
    data: { label: "Điều kiện đáp án", field: "event:answer:satisfaction", operator: "equals", value: "5" },
  }, eventContext, randomUUID()), /không còn quyền automation/, "Event-only conditions must still recheck the actor's current permission and program scope.");
  console.log("PASS G6: durable Form/Survey event, Redis outage recovery and duplicate-delivery guard.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.leads.deleteMany({ where: { id: leadId } });
  await prisma.users.deleteMany({ where: { id: userId } });
  await prisma.automation_jobs.deleteMany({ where: { id: { in: [eventId, rolledBackEventId, ...submittedEventIds] } } });
  await prisma.marketing_forms.deleteMany({ where: { id: formId } });
  await prisma.automation_rules.deleteMany({ where: { id: ruleId } });
  const [{ closeAutomationEngine }, { redisConnection }] = await Promise.all([
    import("../modules/automations/automation-engine.service.js"),
    import("../config/redis.js"),
  ]);
  await closeAutomationEngine();
  await redisConnection?.quit();
  await prisma.$disconnect();
});
