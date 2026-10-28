import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { getLeadDetail } from "../modules/leads/lead-list.service";
import { prisma } from "../database/prisma";
import { mapWebhookPayload, testWebhook } from "../modules/webhooks/webhook.service";
import { webhookFieldMetadata } from "../modules/webhooks/webhook.types";
import { ingestInboundWebhook, processInboundWebhookRequest } from "../modules/webhooks/webhook-v2.service";
import { setWebhookQueueAdapterForTests } from "../modules/webhooks/webhook-queue.service";
import { submitMarketingForm } from "../modules/campaigns/marketing-form-public.service";

async function run() {
  const runId = randomUUID();
  const forms: string[] = [];
  const webhooks: string[] = [];
  const leads: string[] = [];
  let programId: string | undefined;
  try {
    const program = await prisma.institution_programs.create({ data: { code: `SOURCE_${runId}`, name: "Source regression", institution_name: "Test" } });
    programId = program.id;
    const creator = await prisma.users.findFirstOrThrow({ select: { id: true } });
    const studentSource = await prisma.lead_sources.create({ data: { name: "Student classification", institution_program_id: program.id } });
    const actor = { id: creator.id, email: "source@example.test", fullName: "Source tester", avatarUrl: null, roles: [], permissions: ["lead.view_all", "lead.update_all"], departmentIds: [], institutionProgramIds: [program.id], accessScope: "ALL" as const };
    const sourceMapping = { incoming_key: "source", crm_field: "source", is_required: true, default_value: "Configured form" };
    for (const payload of [{}, { source: "" }, { source: "   " }, { source: null }]) {
      const mapped = await mapWebhookPayload(program.id, payload, [sourceMapping], [...webhookFieldMetadata], "Webhook fallback");
      assert.equal(mapped.sourceName, "Configured form");
      assert.equal(mapped.missingRequiredIncoming.length, 0);
      assert.ok(!mapped.missingRequiredCrm.includes("Ngu\u1ed3n"));
      const fallback = await mapWebhookPayload(program.id, payload, [{ ...sourceMapping, default_value: null }], [...webhookFieldMetadata], "Webhook fallback");
      assert.equal(fallback.sourceName, "Webhook fallback");
      assert.equal(fallback.originName, "Khác");
      assert.equal(fallback.missingRequiredIncoming.length, 0);
    }
    const unmapped = await mapWebhookPayload(program.id, {}, [], [...webhookFieldMetadata], "No source mapping");
    assert.equal(unmapped.sourceName, "No source mapping");
    const explicit = await mapWebhookPayload(program.id, { source: "Facebook" }, [sourceMapping], [...webhookFieldMetadata], "Fallback");
    assert.equal(explicit.sourceName, "Facebook");
    assert.equal(explicit.originName, "Khác", "Source names must not infer a source group.");
    assert.equal(explicit.leadValues.sourceId, undefined);
    await assert.rejects(() => mapWebhookPayload(program.id, { source: "x".repeat(256) }, [sourceMapping], [...webhookFieldMetadata], "Fallback"));

    let sequence = 0;
    const phone = () => `089${String(++sequence).padStart(7, "0")}`;
    const secret = randomUUID();
    const webhook = await prisma.webhooks.create({ data: {
      institution_program_id: program.id, name: "Webhook fallback", webhook_key: randomUUID(), secret_hash: await hash(secret, 4), created_by: creator.id,
      duplicate_policy: "UPDATE_EXISTING", field_mappings: { create: [
        { incoming_key: "name", crm_field: "fullName", is_required: true },
        { incoming_key: "phone", crm_field: "phone", is_required: true },
        { ...sourceMapping, default_value: null },
        { incoming_key: "url", crm_field: "sourceGroupUrl", default_value: "https://example.test/?utm_source=google" },
      ] },
    } });
    webhooks.push(webhook.id);
    const legacy = await testWebhook(actor, program.id, webhook.id, { name: "Legacy source fallback", phone: phone(), source: "" });
    assert.ok(legacy.ok);
    const legacyOccurrence = await prisma.lead_source_occurrences.findUniqueOrThrow({ where: { request_id: legacy.data.request_id }, include: { lead_origins: true } });
    leads.push(legacyOccurrence.lead_id);
    assert.equal(legacyOccurrence.source_name, "Webhook fallback");
    assert.equal(legacyOccurrence.lead_origins.name, "Google");
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: legacyOccurrence.lead_id } })).source_id, null);

    setWebhookQueueAdapterForTests({ async add(id) { return { id }; }, async has() { return false; }, async counts() { return {}; } });
    await prisma.webhooks.update({ where: { id: webhook.id }, data: { source_group: "tiktok" } });
    const payload = { name: "Async source fallback", phone: phone(), source: null };
    const ingest = () => ingestInboundWebhook(webhook.webhook_key, secret, payload, runId, async () => ({ allowed: true, retryAfterSeconds: 0 }));
    const received = await ingest(); assert.ok(received.ok);
    // The queued request must use the name captured at ingestion time.
    await prisma.webhooks.update({ where: { id: webhook.id }, data: { name: "Renamed webhook", source_group: "google" } });
    assert.equal((await processInboundWebhookRequest(received.data.request_id)).status, "SUCCEEDED");
    const occurrence = await prisma.lead_source_occurrences.findUniqueOrThrow({ where: { request_id: received.data.request_id } });
    leads.push(occurrence.lead_id);
    assert.equal(occurrence.source_name, "Webhook fallback");
    assert.equal((await prisma.lead_origins.findUniqueOrThrow({ where: { id: occurrence.origin_id } })).name, "TikTok", "The configured group is snapshotted, and overrides URL UTM.");
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: occurrence.lead_id } })).source_id, null);
    const replay = await ingest(); assert.ok(replay.ok);
    assert.equal(replay.data.request_id, received.data.request_id);
    assert.equal((await processInboundWebhookRequest(received.data.request_id)).status, "SUCCEEDED");
    assert.equal(await prisma.lead_source_occurrences.count({ where: { request_id: received.data.request_id } }), 1);
    await prisma.leads.update({ where: { id: occurrence.lead_id }, data: { source_id: studentSource.id } });
    const duplicateReceived = await ingestInboundWebhook(webhook.webhook_key, secret, { ...payload, source: "Facebook" }, randomUUID(), async () => ({ allowed: true, retryAfterSeconds: 0 }));
    assert.ok(duplicateReceived.ok);
    assert.equal((await processInboundWebhookRequest(duplicateReceived.data.request_id)).status, "SUCCEEDED");
    assert.equal(await prisma.lead_source_occurrences.count({ where: { lead_id: occurrence.lead_id } }), 2);
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: occurrence.lead_id } })).source_id, studentSource.id);

    const history = await getLeadDetail(actor, occurrence.lead_id, program.id);
    assert.ok(history);
    assert.equal(history.activities.find((row) => row.type === "lead_updated")?.actorLabel, "API / Webhook · Renamed webhook");
    assert.ok(history.activities.filter((row) => row.type === "source_received").every((row) => row.actorLabel?.startsWith("API / Webhook · ")));
    assert.equal(history.recentChanges.find((row) => row.action === "webhook_update")?.actorLabel, "API / Webhook · Renamed webhook");
    assert.ok(history.recentChanges.filter((row) => row.action === "source_received").every((row) => row.actorLabel?.startsWith("API / Webhook · ")));

    assert.equal(history.activities.find((row) => row.type === "lead_created")?.sourceWebhook, undefined, "No webhook navigation without permission");
    const linkedHistory = await getLeadDetail({ ...actor, permissions: [...actor.permissions, "webhook.view"] }, occurrence.lead_id, program.id);
    assert.ok(linkedHistory);
    assert.deepEqual(linkedHistory.activities.find((row) => row.type === "lead_created")?.sourceWebhook, { id: webhook.id, name: "Webhook fallback" });
    assert.deepEqual(linkedHistory.recentChanges.find((row) => row.action === "create")?.sourceWebhook, { id: webhook.id, name: "Webhook fallback" });
    const otherProgram = await prisma.institution_programs.findFirstOrThrow({ where: { id: { not: program.id } } });
    await prisma.webhooks.update({ where: { id: webhook.id }, data: { institution_program_id: otherProgram.id } });
    const movedHistory = await getLeadDetail({ ...actor, permissions: [...actor.permissions, "webhook.view"] }, occurrence.lead_id, program.id);
    assert.equal(movedHistory?.activities.find((row) => row.type === "lead_created")?.sourceWebhook, undefined, "No cross-program webhook navigation");
    await prisma.webhooks.update({ where: { id: webhook.id }, data: { institution_program_id: program.id } });

    const form = await prisma.marketing_forms.create({ data: {
      platform: "facebook",
      name: "Created form source", public_key: randomUUID(), status: "published", form_type: "lead_form", institution_program_id: program.id, source_id: studentSource.id,
      duplicate_settings: { submissionPolicyVersion: 1, submissionMode: "create_lead", updatePolicy: "fill_empty" },
      marketing_form_fields: { create: [
        { field_key: "name", label: "Name", field_type: "text", crm_mapping_field: "full_name", is_active: true },
        { field_key: "phone", label: "Phone", field_type: "phone", crm_mapping_field: "phone", is_active: true },
      ] },
    } });
    forms.push(form.id);
    const formPayload = { name: "Form source lead", phone: phone() };
    const key = randomUUID();
    const submitted = await submitMarketingForm({ publicKey: form.public_key!, payload: formPayload, idempotencyKey: key }); assert.ok(submitted.ok);
    const formOccurrence = await prisma.lead_source_occurrences.findUniqueOrThrow({ where: { request_id: submitted.data.submissionId }, include: { lead_origins: true } });
    leads.push(formOccurrence.lead_id);
    assert.equal(formOccurrence.source_name, "Created form source");
    assert.equal(formOccurrence.webhook_id, null);
    assert.equal(formOccurrence.lead_origins.name, "Khác", "Platform/form name must not determine attribution in auto mode.");
    assert.equal(formOccurrence.lead_origins.institution_program_id, program.id);
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: formOccurrence.lead_id } })).source_id, studentSource.id);
    await prisma.marketing_forms.update({ where: { id: form.id }, data: { name: "Renamed form source", advanced_settings: { sourceGroup: "zalo" } } });
    const formReplay = await submitMarketingForm({ publicKey: form.public_key!, payload: formPayload, idempotencyKey: key }); assert.ok(formReplay.ok);
    assert.equal(await prisma.lead_source_occurrences.count({ where: { lead_id: formOccurrence.lead_id } }), 1);
    assert.equal((await prisma.lead_source_occurrences.findUniqueOrThrow({ where: { request_id: submitted.data.submissionId } })).source_name, "Created form source");
    const linked = await submitMarketingForm({ publicKey: form.public_key!, payload: formPayload, idempotencyKey: randomUUID() }); assert.ok(linked.ok);
    assert.equal((await prisma.lead_source_occurrences.findUniqueOrThrow({ where: { request_id: linked.data.submissionId } })).source_name, "Renamed form source");
    assert.equal(await prisma.lead_source_occurrences.count({ where: { lead_id: formOccurrence.lead_id } }), 2);
    const linkedOccurrence = await prisma.lead_source_occurrences.findUniqueOrThrow({ where: { request_id: linked.data.submissionId }, include: { lead_origins: true } });
    assert.equal(linkedOccurrence.lead_origins.name, "Zalo");
    assert.equal(await prisma.audit_logs.count({ where: { entity_id: formOccurrence.lead_id, action: "source_received" } }), 2);
    assert.equal(await prisma.lead_activities.count({ where: { lead_id: formOccurrence.lead_id, type: "source_received" } }), 2);
    console.log("PASS customer source: empty/default/fallback, legacy + queued webhook, snapshot/replay, duplicate, form history, scoped groups, independent student source.");
  } finally {
    setWebhookQueueAdapterForTests(undefined);
    if (programId) {
      const generatedLeads = await prisma.leads.findMany({ where: { institution_program_id: programId }, select: { id: true } });
      const origins = await prisma.lead_origins.findMany({ where: { institution_program_id: programId }, select: { id: true } });
      await prisma.audit_logs.deleteMany({ where: { entity_id: { in: [...generatedLeads.map(row => row.id), ...origins.map(row => row.id), ...webhooks, ...forms] } } });
      await prisma.marketing_forms.deleteMany({ where: { id: { in: forms } } });
      await prisma.webhooks.deleteMany({ where: { id: { in: webhooks } } });
      await prisma.leads.deleteMany({ where: { institution_program_id: programId } });
      await prisma.lead_origins.deleteMany({ where: { institution_program_id: programId } });
      await prisma.lead_sources.deleteMany({ where: { institution_program_id: programId } });
      await prisma.lead_channels.deleteMany({ where: { institution_program_id: programId } });
      await prisma.institution_programs.delete({ where: { id: programId } });
    }
    await prisma.$disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
