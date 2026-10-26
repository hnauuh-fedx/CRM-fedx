import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma";
import { submitMarketingForm } from "../modules/campaigns/marketing-form-public.service";
import { assertPublishableMarketingForm, MarketingFormConfigError } from "../modules/campaigns/marketing-form-config.validation";
import { listLeadSurveyHistory } from "../modules/campaigns/marketing-form-lead-history.service";
import { listMarketingFormSubmissions } from "../modules/campaigns/marketing-reference.service";
import { listMarketingFormReviewCandidates, resolveMarketingFormSubmission } from "../modules/campaigns/marketing-form-submission-review.service";
import { createMarketingForm, getMarketingFormById, updateMarketingForm, duplicateMarketingForm } from "../modules/campaigns/marketing-form-management.service";

async function run() {
  const cleanupRun = process.argv.find((arg) => arg.startsWith("--cleanup-ui="))?.slice("--cleanup-ui=".length);
  if (cleanupRun && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanupRun)) throw new Error("Invalid fixture run UUID.");
  if (process.argv.includes("--ui") && !process.stdin.isTTY) throw new Error("UI fixture requires an interactive PTY so cleanup can run after Enter.");
  const runId = cleanupRun ?? randomUUID();
  const forms: string[] = [];
  const leads: string[] = [];
  const base = { full_name: `[TEST G3] ${runId}`, phone: `097${Date.now().toString().slice(-7)}`, email: `g3-${runId}@example.com` };
  const policy = (mode: string, extra = {}) => ({ submissionMode: mode, submissionPolicyVersion: 1, updatePolicy: "fill_empty", ...extra });
  try {
    if (cleanupRun) {
      const marker = `[TEST G3] ${runId}`;
      forms.push(...(await prisma.marketing_forms.findMany({ where: { OR: [{ name: marker }, { name: { startsWith: `${marker} ` } }] }, select: { id: true } })).map((row) => row.id));
      leads.push(...(await prisma.leads.findMany({ where: { OR: [{ full_name: marker }, { full_name: { startsWith: `${marker} ` } }] }, select: { id: true } })).map((row) => row.id));
      console.log(`Cleaning generated UI fixture: ${forms.length} forms, ${leads.length} Leads.`);
      return;
    }
    const programme = await prisma.institution_programs.findFirstOrThrow({ select: { id: true } });
    const source = await prisma.lead_sources.findFirstOrThrow({ where: { OR: [{ institution_program_id: programme.id }, { institution_program_id: null }] }, select: { id: true } });
    const creator = await prisma.users.findFirstOrThrow({ select: { id: true } });
    const createForm = async (mode: string) => {
      const form = await prisma.marketing_forms.create({ data: {
        name: `[TEST G3] ${runId}`, public_key: `g3-${randomUUID()}`, institution_program_id: programme.id, source_id: source.id,
        created_by: creator.id, status: "published", form_type: "lead_form", duplicate_settings: policy(mode),
        marketing_form_fields: { create: [
          { field_key: "full_name", label: "Họ tên", field_type: "text", crm_mapping_field: "full_name", is_active: true },
          { field_key: "phone", label: "Điện thoại", field_type: "phone", crm_mapping_field: "phone", is_active: true },
          { field_key: "email", label: "Email", field_type: "email", crm_mapping_field: "email", is_active: true },
          { field_key: "note", label: "Ghi chú", field_type: "text", crm_mapping_field: "note", is_active: true },
          { field_key: "gender", label: "Giới tính", field_type: "text", crm_mapping_field: "gender", is_active: true },
        ] },
      }, select: { id: true, public_key: true } });
      forms.push(form.id); return form;
    };
    const survey = await createForm("survey_only");
    const received = await submitMarketingForm({ publicKey: survey.public_key!, payload: base, idempotencyKey: randomUUID() });
    assert.ok(received.ok);
    assert.equal((await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: received.data.submissionId } })).lead_id, null, "Explicit survey never creates a Lead despite contact mappings.");
    await assertPublishableMarketingForm([{ fieldKey: "question", fieldType: "text" }], "lead_form", programme.id, prisma, policy("survey_only"));
    await assert.rejects(() => assertPublishableMarketingForm([{ fieldKey: "question", fieldType: "text" }], "survey", programme.id, prisma, policy("create_lead")), MarketingFormConfigError);
    await assert.rejects(() => assertPublishableMarketingForm([{ fieldKey: "question", fieldType: "text" }], "survey", programme.id, prisma, policy("upsert_lead", { overwriteFields: ["assigned_to"] })), MarketingFormConfigError);

    const form = await createForm("create_lead");
    const key = randomUUID();
    const attempts = await Promise.all(Array.from({ length: 3 }, () => submitMarketingForm({ publicKey: form.public_key!, payload: base, idempotencyKey: key })));
    assert.ok(attempts.every((result) => result.ok));
    const result = attempts[0]; assert.ok(result.ok);
    assert.ok(attempts.every((item) => item.ok && item.data.submissionId === result.data.submissionId));
    const submission = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: result.data.submissionId } });
    assert.equal((submission.configuration_snapshot as Record<string, unknown>).processingOutcome, "created_lead");
    assert.ok(submission.lead_id); leads.push(submission.lead_id);
    const lead = await prisma.leads.findUniqueOrThrow({ where: { id: submission.lead_id } });
    assert.equal(lead.assigned_to, null); assert.equal(lead.owner_id, null);
    assert.equal(await prisma.lead_assignments.count({ where: { lead_id: lead.id } }), 0);
    assert.equal("leadId" in result.data, false);
    assert.equal(await prisma.marketing_form_submissions.count({ where: { marketing_form_id: form.id } }), 1);
    assert.equal(await prisma.audit_logs.count({ where: { entity_id: lead.id, action: "create_from_marketing_form" } }), 1);
    assert.equal(await prisma.lead_activities.count({ where: { lead_id: lead.id, type: "marketing_form_submitted" } }), 1);
    const actor = { id: creator.id, email: "fixture@example.com", fullName: "Fixture", avatarUrl: null, roles: [], departmentIds: [], institutionProgramIds: [programme.id], accessScope: "ALL" as const, permissions: ["campaign.view_all", "marketing_form.manage", "lead.view_all", "lead.sensitive.view"] };
    for (const formType of ["lead_form", "survey"] as const) {
      const created = await createMarketingForm(actor, { name: `[TEST G3] ${runId} defaults ${formType}`, status: "draft", formType }, programme.id);
      assert.ok(created.ok); forms.push(created.data.id);
      const saved = await getMarketingFormById(actor, created.data.id); assert.ok(saved.ok);
      assert.equal(saved.data.duplicateSettings && (saved.data.duplicateSettings as Record<string, unknown>).submissionMode, formType === "survey" ? "survey_only" : "create_lead");
    }
    // Updating/copying a legacy form must never apply creation defaults.
    await prisma.marketing_forms.update({ where: { id: survey.id }, data: { duplicate_settings: {}, status: "draft" } });
    const legacyUpdate = await updateMarketingForm(actor, survey.id, { name: `[TEST G3] ${runId} legacy`, status: "draft", formType: "survey", duplicateSettings: {} });
    assert.ok(legacyUpdate.ok);
    const legacySaved = await getMarketingFormById(actor, survey.id); assert.ok(legacySaved.ok);
    assert.deepEqual(legacySaved.data.duplicateSettings, {});
    const copy = await duplicateMarketingForm(actor, survey.id); assert.ok(copy.ok); forms.push(copy.data.id);
    const copied = await getMarketingFormById(actor, copy.data.id); assert.ok(copied.ok); assert.deepEqual(copied.data.duplicateSettings, {});
    const history = await listLeadSurveyHistory(actor, lead.id, programme.id, 1, 1);
    assert.ok(history.ok); assert.equal(history.data.data.length, 1); assert.equal(history.data.data[0].id, submission.id);
    assert.equal((await listLeadSurveyHistory({ ...actor, permissions: ["lead.view_all", "lead.sensitive.view"] }, lead.id, programme.id, 1, 10)).ok, false);
    assert.equal((await listLeadSurveyHistory({ ...actor, permissions: ["marketing_form.manage"] }, lead.id, programme.id, 1, 10)).ok, false);
    assert.equal((await listLeadSurveyHistory({ ...actor, accessScope: "ASSIGNED_ONLY", permissions: ["marketing_form.manage", "lead.view_assigned", "lead.sensitive.view"] }, lead.id, programme.id, 1, 10)).ok, false);
    assert.equal((await listLeadSurveyHistory(actor, lead.id, randomUUID(), 1, 10)).ok, false);
    const searched = await listMarketingFormSubmissions(actor, form.id, { page: 1, limit: 1, search: lead.phone });
    assert.ok(searched.ok); assert.equal(searched.data.pagination.total, 1);
    const receiptSearch = await listMarketingFormSubmissions(actor, form.id, { page: 1, limit: 1, search: submission.id, status: "processed" });
    assert.ok(receiptSearch.ok); assert.equal(receiptSearch.data.data[0].id, submission.id);
    const emptySearch = await listMarketingFormSubmissions(actor, form.id, { page: 1, limit: 1, search: "no matching fixture" });
    assert.ok(emptySearch.ok); assert.equal(emptySearch.data.pagination.total, 0);
    const changedRetry = await submitMarketingForm({ publicKey: form.public_key!, payload: { ...base, full_name: "Changed" }, idempotencyKey: key });
    assert.ok(!changedRetry.ok); assert.equal(changedRetry.status, 409);
    const sameCanonical = await submitMarketingForm({ publicKey: form.public_key!, payload: { email: base.email, phone: base.phone, full_name: base.full_name }, idempotencyKey: key });
    assert.ok(sameCanonical.ok); assert.deepEqual(sameCanonical.data, result.data);
    const duplicate = await submitMarketingForm({ publicKey: form.public_key!, payload: { ...base, note: "Do not overwrite" }, idempotencyKey: randomUUID() });
    assert.ok(duplicate.ok);
    assert.equal((await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: duplicate.data.submissionId } })).status, "linked");
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: lead.id } })).note, lead.note);

    await prisma.leads.update({ where: { id: lead.id }, data: { gender: null } });
    await prisma.marketing_forms.update({ where: { id: form.id }, data: { duplicate_settings: policy("upsert_lead") } });
    const update = await submitMarketingForm({ publicKey: form.public_key!, payload: { ...base, gender: "female", note: "Not allowed" } });
    assert.ok(update.ok);
    const filled = await prisma.leads.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(filled.gender, "female"); assert.equal(filled.note, lead.note);
    await prisma.marketing_forms.update({ where: { id: form.id }, data: { duplicate_settings: policy("upsert_lead", { updatePolicy: "overwrite_selected", overwriteFields: ["note"] }) } });
    const overwritten = await submitMarketingForm({ publicKey: form.public_key!, payload: { ...base, note: "Explicit replacement", gender: "male" } });
    assert.ok(overwritten.ok);
    const finalLead = await prisma.leads.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(finalLead.note, "Explicit replacement"); assert.equal(finalLead.gender, "female"); assert.equal(finalLead.phone, base.phone);

    const other = await prisma.leads.create({ data: { full_name: `[TEST G3] ${runId}`, phone: `096${Date.now().toString().slice(-7)}`, email: `other-${runId}@example.com`, source_id: source.id, institution_program_id: programme.id }, select: { id: true, email: true } }); leads.push(other.id);
    const conflict = await submitMarketingForm({ publicKey: form.public_key!, payload: { ...base, email: other.email, note: "Must not write" } });
    assert.ok(conflict.ok); assert.equal(conflict.data.status, "processed");
    const conflictRow = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: conflict.data.submissionId } });
    assert.equal(conflictRow.status, "needs_review"); assert.equal(conflictRow.lead_id, null);
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: lead.id } })).note, finalLead.note);

    const reviewer = { ...actor, permissions: [...actor.permissions, "lead.update_all"] };
    assert.equal((await listMarketingFormReviewCandidates(actor, programme.id, form.id, conflictRow.id, 1, 20)).ok, false, "View-only actor cannot resolve duplicates.");
    assert.equal((await resolveMarketingFormSubmission({ ...reviewer, accessScope: "READ_ONLY" }, programme.id, form.id, conflictRow.id, { action: "ignore", reason: "Fixture" })).ok, false);
    assert.equal((await listMarketingFormReviewCandidates(reviewer, randomUUID(), form.id, conflictRow.id, 1, 20)).ok, false);
    const candidates = await listMarketingFormReviewCandidates(reviewer, programme.id, form.id, conflictRow.id, 1, 1);
    assert.ok(candidates.ok); assert.equal(candidates.data.pagination.total, 2); assert.equal(candidates.data.data.length, 1);
    assert.deepEqual(Object.keys(candidates.data.data[0]).sort(), ["fullName", "id", "leadCode", "phone"], "Candidate serializer excludes sensitive fields.");
    const restricted = { ...reviewer, permissions: [...actor.permissions, "lead.update_assigned"] };
    const restrictedCandidates = await listMarketingFormReviewCandidates(restricted, programme.id, form.id, conflictRow.id, 1, 20);
    assert.ok(restrictedCandidates.ok); assert.equal(restrictedCandidates.data.pagination.total, 0, "Global viewing does not imply global mutation scope.");
    assert.equal((await resolveMarketingFormSubmission(restricted, programme.id, form.id, conflictRow.id, { action: "link", leadId: lead.id, reason: "Fixture" })).ok, false);
    assert.equal((await resolveMarketingFormSubmission(reviewer, programme.id, form.id, conflictRow.id, { action: "link", leadId: randomUUID(), reason: "Fixture" })).ok, false);
    const anotherProgramme = await prisma.institution_programs.findFirstOrThrow({ where: { id: { not: programme.id } }, select: { id: true } });
    const outsideLead = await prisma.leads.create({ data: { full_name: `[TEST G3] ${runId} outside`, phone: base.phone, source_id: source.id, institution_program_id: anotherProgramme.id }, select: { id: true } }); leads.push(outsideLead.id);
    assert.equal((await resolveMarketingFormSubmission({ ...reviewer, institutionProgramIds: [programme.id, anotherProgramme.id] }, programme.id, form.id, conflictRow.id, { action: "link", leadId: outsideLead.id, reason: "Fixture" })).ok, false, "Matching contact in a different programme cannot be linked.");
    const beforeReview = await prisma.leads.findUniqueOrThrow({ where: { id: lead.id } });
    const resolved = await Promise.all(Array.from({ length: 2 }, () => resolveMarketingFormSubmission(reviewer, programme.id, form.id, conflictRow.id, { action: "link", leadId: lead.id, reason: "Xác nhận điện thoại fixture" })));
    assert.ok(resolved.every((item) => item.ok));
    assert.equal(resolved.filter((item) => item.ok && item.data.replayed).length, 1);
    assert.equal(await prisma.audit_logs.count({ where: { entity_type: "marketing_form_submission", entity_id: conflictRow.id } }), 1);
    assert.equal(await prisma.lead_activities.count({ where: { lead_id: lead.id, type: "marketing_form_reviewed" } }), 1);
    assert.deepEqual(await prisma.leads.findUniqueOrThrow({ where: { id: lead.id } }), beforeReview, "Review does not overwrite Lead or Sale.");
    const afterReview = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: conflictRow.id } });
    assert.equal(afterReview.status, "linked"); assert.equal(afterReview.lead_id, lead.id);
    assert.deepEqual(afterReview.answers, conflictRow.answers); assert.deepEqual(afterReview.configuration_snapshot, conflictRow.configuration_snapshot);
    assert.equal((await resolveMarketingFormSubmission(reviewer, programme.id, form.id, conflictRow.id, { action: "ignore", reason: "Fixture competing decision" })).ok, false);
    const ignoredReceipt = await submitMarketingForm({ publicKey: form.public_key!, payload: { ...base, email: other.email } }); assert.ok(ignoredReceipt.ok);
    const ignoredBefore = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: ignoredReceipt.data.submissionId } });
    assert.equal(ignoredBefore.status, "needs_review");
    assert.ok((await resolveMarketingFormSubmission(reviewer, programme.id, form.id, ignoredBefore.id, { action: "ignore", reason: "Giữ câu trả lời, chưa xác định Lead" })).ok);
    const ignoredAfter = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: ignoredBefore.id } });
    assert.equal(ignoredAfter.status, "ignored"); assert.equal(ignoredAfter.lead_id, null); assert.deepEqual(ignoredAfter.answers, ignoredBefore.answers);
    const reviewedHistory = await listLeadSurveyHistory(actor, lead.id, programme.id, 1, 100);
    assert.ok(reviewedHistory.ok); assert.ok(reviewedHistory.data.data.some((row) => row.id === conflictRow.id));

    const second = await createForm("create_lead");
    const competing = { ...base, phone: `095${Date.now().toString().slice(-7)}`, email: `race-${runId}@example.com` };
    const raced = await Promise.all([form, second].map((item) => submitMarketingForm({ publicKey: item.public_key!, payload: competing, idempotencyKey: randomUUID() })));
    assert.ok(raced.every((item) => item.ok));
    const newLeads = await prisma.leads.findMany({ where: { institution_program_id: programme.id, phone: competing.phone }, select: { id: true } });
    leads.push(...newLeads.map((item) => item.id)); assert.equal(newLeads.length, 1, "Cross-form concurrent submit creates a single Lead.");
    if (process.argv.includes("--ui")) {
      const uiReceipt = await submitMarketingForm({ publicKey: form.public_key!, payload: { ...base, email: other.email } }); assert.ok(uiReceipt.ok);
      console.log(JSON.stringify({ uiFixture: true, programId: programme.id, formId: form.id, leadId: lead.id, submissionId: uiReceipt.data.submissionId }));
      console.log("UI fixture ready. Press Enter to clean up only this run's generated records.");
      await new Promise<void>((resolve) => { process.stdin.resume(); process.stdin.once("data", () => { process.stdin.pause(); resolve(); }); });
    }
    console.log("PASS G3: survey-only, publication policy, unassigned create, replay/hash conflict, link/upsert allowlist, ambiguous match, cross-form concurrency, audit/activity.");
  } finally {
    // Only delete fixture records tracked by their generated IDs.
    const linked = forms.length ? await prisma.marketing_form_submissions.findMany({ where: { marketing_form_id: { in: forms }, lead_id: { not: null } }, select: { lead_id: true } }) : [];
    const tracked = [...new Set([...leads, ...linked.flatMap((row) => row.lead_id ? [row.lead_id] : [])])];
    const ids = (await prisma.leads.findMany({ where: { id: { in: tracked }, full_name: { contains: runId } }, select: { id: true } })).map((row) => row.id);
    const submissionIds = (await prisma.marketing_form_submissions.findMany({ where: { marketing_form_id: { in: forms } }, select: { id: true } })).map((row) => row.id);
    await prisma.audit_logs.deleteMany({ where: { entity_type: "marketing_form_submission", entity_id: { in: submissionIds } } });
    await prisma.marketing_forms.deleteMany({ where: { id: { in: forms } } });
    await prisma.audit_logs.deleteMany({ where: { entity_type: "marketing_form", entity_id: { in: forms } } });
    await prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: { in: ids } } });
    await prisma.leads.deleteMany({ where: { id: { in: ids }, full_name: { contains: runId } } });
    await prisma.$disconnect();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
