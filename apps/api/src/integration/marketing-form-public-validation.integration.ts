import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma";
import { getPublicMarketingFormConfig, submitMarketingForm } from "../modules/campaigns/marketing-form-public.service";
import { createMarketingFormField, publishMarketingForm, updateMarketingForm, updateMarketingFormField } from "../modules/campaigns/marketing-form-management.service";
import { MarketingFormConfigError } from "../modules/campaigns/marketing-form-config.validation";
import { listMarketingFormSubmissions } from "../modules/campaigns/marketing-reference.service";
import { normalizeMarketingFormOptions } from "@admission-crm/shared/marketing-form-config";
import { newMarketingFormSubmissionSettings } from "@admission-crm/shared/marketing-form-submission-policy";

async function run() {
  const publicKey = `validation-${randomUUID()}`;
  let formId: string | undefined;
  let leadId: string | undefined;
  let surveyLeadId: string | undefined;
  let visibilityLeadId: string | undefined;
  try {
    const major = await prisma.majors.findFirst({ where: { institution_program_id: { not: null } }, select: { id: true, institution_program_id: true } });
    assert.ok(major, "Cần ngành mẫu để kiểm tra mapping form public.");
    const form = await prisma.marketing_forms.create({
      data: {
        name: "[TEST] Public form reference validation",
        public_key: publicKey,
        status: "active",
        form_type: "lead_form",
        institution_program_id: major.institution_program_id,
        marketing_form_fields: { create: [
          { field_key: "full_name", label: "Họ tên", field_type: "text", is_active: true, is_required: true, crm_mapping_field: "full_name" },
          { field_key: "phone", label: "Số điện thoại", field_type: "phone", is_active: true, is_required: true, crm_mapping_field: "phone" },
          { field_key: "major_id", label: "Ngành quan tâm", field_type: "select", is_active: true, options: ["Lựa chọn 1", major.id, randomUUID()], crm_mapping_field: "major_id" },
        ] },
      },
      select: { id: true },
    });
    formId = form.id;
    const submissionCountBeforeHoneypot = await prisma.marketing_form_submissions.count({ where: { marketing_form_id: form.id } });
    const honeypot = await submitMarketingForm({ publicKey, payload: { full_name: "[TEST] Honeypot", phone: `097${Date.now().toString().slice(-7)}`, website: "https://spam.example" } });
    assert.equal(honeypot.ok, false, "Honeypot filled by a bot must be rejected.");
    if (!honeypot.ok) assert.equal(honeypot.status, 400);
    assert.equal(await prisma.marketing_form_submissions.count({ where: { marketing_form_id: form.id } }), submissionCountBeforeHoneypot, "Rejected honeypot data must not create a submission.");
    const payload = { full_name: "[TEST] Public form references", phone: `099${Date.now().toString().slice(-7)}` };
    const invalid = await submitMarketingForm({ publicKey, payload: { ...payload, major_id: "Lựa chọn 1" } });
    assert.equal(invalid.ok, false, "Lựa chọn mẫu không được gây lỗi Prisma khi tạo Lead.");
    if (!invalid.ok) {
      assert.equal(invalid.status, 400);
      assert.match(invalid.message, /Ngành quan tâm/);
    }
    const unknownId = (await prisma.marketing_form_fields.findFirstOrThrow({ where: { marketing_form_id: formId, field_key: "major_id" }, select: { options: true } })).options as string[];
    const unavailable = await submitMarketingForm({ publicKey, payload: { ...payload, major_id: unknownId[2] } });
    assert.equal(unavailable.ok, false, "Mã ngành không tồn tại phải trả lỗi nhập liệu.");
    if (!unavailable.ok) assert.equal(unavailable.status, 400);
    const valid = await submitMarketingForm({ publicKey, payload: { ...payload, major_id: major.id } });
    assert.equal(valid.ok, true, "Mapping mã ngành đúng phải tạo được Lead.");
    if (valid.ok) {
      assert.equal("leadId" in valid.data, false);
      leadId = (await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: valid.data.submissionId }, select: { lead_id: true } })).lead_id ?? undefined;
      assert.ok(leadId);
      const lead = await prisma.leads.findUniqueOrThrow({ where: { id: leadId }, select: { major_id: true, phone: true } });
      assert.equal(lead.major_id, major.id);
      assert.equal(lead.phone, payload.phone);
    }
    const director = await prisma.users.findUniqueOrThrow({ where: { email: "director@tvu.edu.vn" }, select: { id: true } });
    const actor = { id: director.id, permissions: ["campaign.view_all", "marketing_form.manage"], departmentIds: [], accessScope: "ALL" as const, institutionProgramIds: [major.institution_program_id!] };
    await assert.rejects(() => publishMarketingForm(actor, form.id), (error: unknown) => error instanceof MarketingFormConfigError && error.issues.some((issue) => issue.path[2] === "options"));
    const surveyField = await prisma.marketing_form_fields.findFirstOrThrow({ where: { marketing_form_id: formId, field_key: "major_id" }, select: { id: true } });
    const mappedUpdate = await updateMarketingFormField(actor, surveyField.id, { fieldKey: "major_id", label: "Ngành quan tâm", fieldType: "select", options: [{ value: major.id, label: "Tên ngành dễ đọc" }], crmMappingField: "major_id", isRequired: false, isActive: true, sortOrder: 2 });
    assert.equal(mappedUpdate.ok, true);
    assert.equal((await publishMarketingForm(actor, form.id)).ok, true);
    const publicConfig = await getPublicMarketingFormConfig(publicKey);
    assert.deepEqual(publicConfig?.fields.find((field) => field.fieldKey === "major_id")?.options, [{ value: major.id, label: "Tên ngành dễ đọc" }]);
    const typedSubmit = await submitMarketingForm({ publicKey, payload: { ...payload, major_id: major.id } });
    assert.equal(typedSubmit.ok, true, "Typed options submit their UUID rather than their display label.");
    await prisma.marketing_form_field_mappings.upsert({ where: { marketing_form_id_source_field: { marketing_form_id: formId, source_field: "major_id" } }, create: { marketing_form_id: formId, source_field: "major_id", lead_field: "major_id" }, update: { form_field_id: null } });
    const updated = await updateMarketingFormField({ id: director.id, permissions: ["campaign.view_all", "marketing_form.manage"], departmentIds: [], accessScope: "ALL", institutionProgramIds: [major.institution_program_id!] }, surveyField.id, {
      fieldKey: "major_id", label: "Ngành quan tâm", fieldType: "select", options: unknownId, isRequired: false, isActive: true, sortOrder: 2,
    });
    assert.equal(updated.ok, true);
    assert.equal(await prisma.marketing_form_field_mappings.count({ where: { marketing_form_id: formId, source_field: "major_id" } }), 0, "Bỏ mapping phải dọn cả liên kết cũ không có form_field_id.");
    const survey = await submitMarketingForm({ publicKey, payload: { ...payload, phone: `098${Date.now().toString().slice(-7)}`, major_id: "Lựa chọn 1" } });
    assert.equal(survey.ok, true, "Câu trả lời khảo sát không mapping phải gửi được.");
    if (survey.ok) {
      surveyLeadId = (await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: survey.data.submissionId }, select: { lead_id: true } })).lead_id ?? undefined;
      assert.ok(surveyLeadId);
      const lead = await prisma.leads.findUniqueOrThrow({ where: { id: surveyLeadId }, select: { major_id: true } });
      assert.equal(lead.major_id, null);
      const submission = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: survey.data.submissionId }, select: { answers: true } });
      assert.equal((submission.answers as Record<string, unknown>).major_id, "Lựa chọn 1");
    }
    const saved = await updateMarketingForm(actor, form.id, {
      name: "[TEST] Survey only", status: "draft", formType: "survey",
      fields: [{ fieldKey: "major_id", label: "Khảo sát", fieldType: "multi_select", options: ["Lựa chọn 1", "Lựa chọn 2"], isRequired: true, isActive: true, sortOrder: 0 }],
      mappings: [{ sourceField: "major_id", leadField: "major_id", isRequired: false }],
    });
    assert.equal(saved.ok, true);
    assert.equal(await prisma.marketing_form_field_mappings.count({ where: { marketing_form_id: form.id } }), 0, "Full form save must not revive stale explicit mappings.");
    assert.equal((await publishMarketingForm(actor, form.id)).ok, true, "Survey-only form can publish without contact mappings.");
    const multiple = await submitMarketingForm({ publicKey, payload: { major_id: ["Lựa chọn 1", "Lựa chọn 2"] } });
    assert.equal(multiple.ok, true, "Required multi-select accepts a non-empty array.");
    if (multiple.ok) {
      assert.equal((await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: multiple.data.submissionId }, select: { lead_id: true } })).lead_id, null);
      const original = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: multiple.data.submissionId }, select: { configuration_snapshot: true } });
      assert.equal((original.configuration_snapshot as { fields: Array<{ label: string }> }).fields[0].label, "Khảo sát");
      const question = await prisma.marketing_form_fields.findFirstOrThrow({ where: { marketing_form_id: form.id }, select: { id: true } });
      assert.equal((await updateMarketingFormField(actor, question.id, { fieldKey: "major_id", label: "Khảo sát đổi nhãn", fieldType: "multi_select", options: ["Lựa chọn 1", "Lựa chọn 2"], isRequired: true, isActive: true, sortOrder: 0 })).ok, true);
      assert.deepEqual((await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: multiple.data.submissionId }, select: { configuration_snapshot: true } })).configuration_snapshot, original.configuration_snapshot, "Editing the form must not rewrite historical snapshots.");
      const legacy = await prisma.marketing_form_submissions.create({ data: { marketing_form_id: form.id, raw_payload: {}, answers: { old_key: "old_value" }, status: "received" }, select: { id: true } });
      const results = await listMarketingFormSubmissions(actor, form.id, { page: 1, limit: 100 });
      assert.ok(results.ok);
      if (results.ok) {
        assert.equal(results.data.data.find((item) => item.id === legacy.id)?.isLegacyConfiguration, true);
        assert.equal(results.data.data.find((item) => item.id === multiple.data.submissionId)?.isLegacyConfiguration, false);
      }
      assert.equal((await listMarketingFormSubmissions({ ...actor, institutionProgramIds: [randomUUID()] }, form.id, { page: 1, limit: 10 })).ok, false);
    }
    const forged = await submitMarketingForm({ publicKey, payload: { major_id: ["Ngoài danh sách"] } });
    assert.equal(forged.ok, false, "Array options cannot bypass server validation.");
    const currentQuestion = await prisma.marketing_form_fields.findFirstOrThrow({ where: { marketing_form_id: form.id }, select: { id: true } });
    await assert.rejects(() => updateMarketingFormField(actor, currentQuestion.id, { fieldKey: "major_id", label: "Invalid", fieldType: "multi_select", options: [], isRequired: true, isActive: true, sortOrder: 0 }), MarketingFormConfigError);
    assert.deepEqual(normalizeMarketingFormOptions((await prisma.marketing_form_fields.findUniqueOrThrow({ where: { id: currentQuestion.id }, select: { options: true } })).options).map((option) => option.value), ["Lựa chọn 1", "Lựa chọn 2"], "Invalid published edit rolls back fields and mappings.");
    const racing = await Promise.allSettled(["a", "b"].map((suffix) => createMarketingFormField(actor, form.id, { fieldKey: `note_${suffix}`, label: "Ghi chú", fieldType: "text", crmMappingField: "note", isRequired: false, isActive: true, sortOrder: 3 })));
    assert.equal(racing.filter((result) => result.status === "fulfilled" && result.value.ok).length, 1, "Only one competing note mapping may commit.");
    assert.equal(racing.filter((result) => result.status === "rejected" && result.reason instanceof MarketingFormConfigError).length, 1);
    const visibilityFields = [
      { fieldKey: "full_name", label: "Họ tên", fieldType: "text" as const, crmMappingField: "full_name" as const, isRequired: true },
      { fieldKey: "phone", label: "Điện thoại", fieldType: "phone" as const, crmMappingField: "phone" as const, isRequired: true },
      { fieldKey: "kind", label: "Cần tư vấn", fieldType: "radio" as const, options: ["yes", "no"] },
      { fieldKey: "details", label: "Nội dung tư vấn", fieldType: "textarea" as const, crmMappingField: "note" as const, isRequired: true, validationRules: { questionDescription: "Hãy mô tả nhu cầu tư vấn.\nKhông ghi thông tin nhạy cảm.", visibility: { parentFieldKey: "kind", operator: "equals", value: "yes" } } },
      { fieldKey: "extra", label: "Thông tin thêm", fieldType: "text" as const, isRequired: true, validationRules: { visibility: { parentFieldKey: "details", operator: "is_not_empty" } } },
    ].map((field, sortOrder) => ({ ...field, isRequired: field.isRequired ?? false, sortOrder, isActive: true }));
    const visibilityInput = { name: "[TEST] Visibility", status: "draft" as const, formType: "lead_form" as const, duplicateSettings: newMarketingFormSubmissionSettings("lead_form"), fields: visibilityFields };
    await assert.rejects(() => updateMarketingForm(actor, form.id, { ...visibilityInput, fields: visibilityFields.map(field => field.fieldKey === "details" ? { ...field, validationRules: { ...field.validationRules, questionDescription: "a".repeat(1001) } } : field) }), MarketingFormConfigError, "Malformed descriptions cannot save, even in drafts.");
    await assert.rejects(() => updateMarketingForm(actor, form.id, { ...visibilityInput, fields: [{ ...visibilityFields[0], validationRules: { visibility: { parentFieldKey: "extra", operator: "is_not_empty" } } }, ...visibilityFields.slice(1), { fieldKey: "loop", label: "Loop", fieldType: "text", isRequired: false, isActive: true, sortOrder: 5, validationRules: { visibility: { parentFieldKey: "loop", operator: "is_empty" } } }] }), MarketingFormConfigError);
    assert.equal((await updateMarketingForm(actor, form.id, visibilityInput)).ok, true);
    assert.equal((await publishMarketingForm(actor, form.id)).ok, true);
    const descriptionConfig = await getPublicMarketingFormConfig(publicKey);
    assert.ok(descriptionConfig);
    assert.deepEqual(descriptionConfig.fields.find(field => field.fieldKey === "details")?.validationRules, visibilityFields.find(field => field.fieldKey === "details")?.validationRules, "Saved description reaches public config alongside visibility.");
    const visiblePhone = `096${Date.now().toString().slice(-7)}`;
    const contact = { full_name: `[TEST] Visibility ${publicKey}`, phone: visiblePhone };
    const hidden = await submitMarketingForm({ publicKey, payload: { ...contact, kind: "no", details: "FORGED HIDDEN NOTE", extra: "FORGED DESCENDANT", utm_source: "visibility-fixture", utm_content: "cta-a", source_url: "https://landing.example/form", source_referrer: "https://search.example/" } });
    assert.ok(hidden.ok, "Hidden required questions cannot block submission.");
    const hiddenRow = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: hidden.data.submissionId } });
    const descriptionSnapshot = hiddenRow.configuration_snapshot as { fields: Array<{ fieldKey: string; validationRules: Record<string, unknown> }> };
    assert.equal(descriptionSnapshot.fields.find(field => field.fieldKey === "details")?.validationRules.questionDescription, "Hãy mô tả nhu cầu tư vấn.\nKhông ghi thông tin nhạy cảm.");
    visibilityLeadId = hiddenRow.lead_id!;
    assert.ok(visibilityLeadId);
    for (const record of [hiddenRow.answers, hiddenRow.raw_payload, hiddenRow.normalized_payload]) {
      for (const key of ["details", "extra", "note"]) assert.equal(key in (record as Record<string, unknown>), false, "Hidden data cannot persist in raw/answers/CRM payload.");
    }
    assert.equal((hiddenRow.raw_payload as Record<string, unknown>).utm_source, "visibility-fixture");
    assert.equal((hiddenRow.raw_payload as Record<string, unknown>).utm_content, "cta-a");
    assert.equal((hiddenRow.raw_payload as Record<string, unknown>).source_url, "https://landing.example/form");
    assert.equal((hiddenRow.raw_payload as Record<string, unknown>).source_referrer, "https://search.example/");
    assert.equal((await submitMarketingForm({ publicKey, payload: { ...contact, kind: "no", utm_source: "x".repeat(201) } })).ok, false, "Overlong tracking is rejected server-side.");
    assert.equal((await submitMarketingForm({ publicKey, payload: { ...contact, kind: "no", source_url: "javascript:alert(1)" } })).ok, false, "Unsafe source URL is rejected server-side.");
    assert.equal((await prisma.leads.findUniqueOrThrow({ where: { id: visibilityLeadId }, select: { note: true } })).note, "Lead được tạo từ biểu mẫu [TEST] Visibility.", "Only the existing system note is written, never the forged hidden answer.");
    assert.equal((await submitMarketingForm({ publicKey, payload: { ...contact, kind: "yes" } })).ok, false, "Visible required question must be validated.");
    assert.equal((await submitMarketingForm({ publicKey, payload: { ...contact, kind: "yes", details: "Visible", extra: "Answer" } })).ok, true);
    const descriptionField = await prisma.marketing_form_fields.findFirstOrThrow({ where: { marketing_form_id: form.id, field_key: "details" }, select: { id: true } });
    const details = visibilityFields.find(field => field.fieldKey === "details")!;
    assert.equal((await updateMarketingFormField(actor, descriptionField.id, { ...details, validationRules: { ...details.validationRules, questionDescription: "Hướng dẫn mới" } })).ok, true);
    assert.deepEqual((await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: hidden.data.submissionId }, select: { configuration_snapshot: true } })).configuration_snapshot, hiddenRow.configuration_snapshot, "Editing descriptions cannot rewrite previous snapshots.");
    await assert.rejects(() => updateMarketingForm(actor, form.id, { ...visibilityInput, status: "published", fields: visibilityFields.map(field => field.fieldKey === "phone" ? { ...field, validationRules: { visibility: { parentFieldKey: "kind", operator: "is_not_empty" } } } : field) }), MarketingFormConfigError);
    const ratingFields = [
      { fieldKey: "kind", label: "Có đánh giá", fieldType: "radio" as const, options: ["yes", "no"], isRequired: true, isActive: true, sortOrder: 0 },
      { fieldKey: "score", label: "Mức hài lòng", fieldType: "rating" as const, isRequired: true, isActive: true, sortOrder: 1, defaultValue: "8", validationRules: { ratingMax: 10, visibility: { parentFieldKey: "kind", operator: "equals", value: "yes" } } },
    ];
    const ratingInput = { name: "[TEST] Rating", status: "draft" as const, formType: "survey" as const, duplicateSettings: newMarketingFormSubmissionSettings("survey"), fields: ratingFields };
    const scoreField = ratingFields[1];
    for (const invalidScoreField of [{ ...scoreField, validationRules: { ratingMax: 11 } }, { ...scoreField, defaultValue: "11" }, { ...scoreField, crmMappingField: "note" as const }]) {
      await assert.rejects(() => updateMarketingForm(actor, form.id, { ...ratingInput, fields: [ratingFields[0], invalidScoreField] }), MarketingFormConfigError);
    }
    assert.ok((await updateMarketingForm(actor, form.id, ratingInput)).ok);
    assert.ok((await publishMarketingForm(actor, form.id)).ok);
    assert.deepEqual((await getPublicMarketingFormConfig(publicKey))?.fields.find(field => field.fieldKey === "score")?.validationRules, scoreField.validationRules);
    const ratingCount = await prisma.marketing_form_submissions.count({ where: { marketing_form_id: form.id, status: "processed" } });
    for (const score of [undefined, 0, 11, -1, 1.5, true, "01", "1e0", ["3"], { value: 3 }]) {
      const rejected = await submitMarketingForm({ publicKey, payload: { kind: "yes", score } });
      assert.ok(!rejected.ok); assert.equal(rejected.status, 400);
      assert.ok(rejected.submissionId);
      const failedRating = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: rejected.submissionId } });
      assert.equal(failedRating.status, "failed"); assert.equal(failedRating.lead_id, null);
    }
    assert.equal(await prisma.marketing_form_submissions.count({ where: { marketing_form_id: form.id, status: "processed" } }), ratingCount, "Rejected ratings retain the existing failed receipt, never a successful response or Lead.");
    const rated = await submitMarketingForm({ publicKey, payload: { kind: "yes", score: "8" } });
    assert.ok(rated.ok);
    const ratedRow = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: rated.data.submissionId } });
    assert.equal((ratedRow.answers as Record<string, unknown>).score, "8"); assert.equal(ratedRow.lead_id, null);
    assert.equal((ratedRow.configuration_snapshot as { fields: Array<{ fieldKey: string; validationRules: Record<string, unknown> }> }).fields.find(field => field.fieldKey === "score")?.validationRules.ratingMax, 10);
    const hiddenRating = await submitMarketingForm({ publicKey, payload: { kind: "no", score: "FORGED" } });
    assert.ok(hiddenRating.ok);
    const hiddenRatingRow = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: hiddenRating.data.submissionId } });
    assert.equal("score" in (hiddenRatingRow.answers as Record<string, unknown>), false);
    assert.equal("score" in (hiddenRatingRow.raw_payload as Record<string, unknown>), false);
    const savedRatingField = await prisma.marketing_form_fields.findFirstOrThrow({ where: { marketing_form_id: form.id, field_key: "score" }, select: { id: true } });
    assert.ok((await updateMarketingFormField(actor, savedRatingField.id, { ...scoreField, defaultValue: "3", validationRules: { ...scoreField.validationRules, ratingMax: 5 } })).ok);
    assert.deepEqual((await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: rated.data.submissionId }, select: { configuration_snapshot: true } })).configuration_snapshot, ratedRow.configuration_snapshot);
    const otherFields = [
      { fieldKey: "kind", label: "Có nhu cầu", fieldType: "radio" as const, options: ["yes", "no"], isRequired: true, isActive: true, sortOrder: 0 },
      { fieldKey: "interest", label: "Quan tâm", fieldType: "select" as const, options: [{ value: "a", label: "Đáp án A" }], isRequired: true, isActive: true, sortOrder: 1, validationRules: { allowOther: true, visibility: { parentFieldKey: "kind", operator: "equals", value: "yes" } } },
    ];
    const otherInput = { name: "[TEST] Other", status: "draft" as const, formType: "survey" as const, duplicateSettings: newMarketingFormSubmissionSettings("survey"), fields: otherFields };
    await assert.rejects(() => updateMarketingForm(actor, form.id, { ...otherInput, fields: [otherFields[0], { ...otherFields[1], crmMappingField: "note" }] }), MarketingFormConfigError);
    assert.ok((await updateMarketingForm(actor, form.id, otherInput)).ok);
    assert.ok((await publishMarketingForm(actor, form.id)).ok);
    for (const interest of ["free text", "__survey_other__", { kind: "other", text: "" }, { kind: "other", text: "a".repeat(1001) }, { kind: "other", text: "Valid", extra: "forged" }, { kind: "other", text: [] }]) {
      const rejected = await submitMarketingForm({ publicKey, payload: { kind: "yes", interest } });
      assert.ok(!rejected.ok); assert.equal(rejected.status, 400);
    }
    const otherAnswer = { kind: "other", text: "Hướng lựa chọn riêng" };
    const otherReceipt = await submitMarketingForm({ publicKey, payload: { kind: "yes", interest: otherAnswer } });
    assert.ok(otherReceipt.ok);
    const otherRow = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: otherReceipt.data.submissionId } });
    assert.deepEqual((otherRow.answers as Record<string, unknown>).interest, otherAnswer);
    assert.equal(otherRow.lead_id, null); assert.deepEqual(otherRow.normalized_payload, {});
    const regular = await submitMarketingForm({ publicKey, payload: { kind: "yes", interest: "a" } }); assert.ok(regular.ok);
    const hiddenOther = await submitMarketingForm({ publicKey, payload: { kind: "no", interest: otherAnswer } }); assert.ok(hiddenOther.ok);
    const hiddenOtherRow = await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: hiddenOther.data.submissionId } });
    assert.equal("interest" in (hiddenOtherRow.raw_payload as Record<string, unknown>), false);
    assert.equal("interest" in (hiddenOtherRow.answers as Record<string, unknown>), false);
    const otherField = await prisma.marketing_form_fields.findFirstOrThrow({ where: { marketing_form_id: form.id, field_key: "interest" }, select: { id: true } });
    assert.ok((await updateMarketingFormField(actor, otherField.id, { ...otherFields[1], validationRules: { ...otherFields[1].validationRules, allowOther: false } })).ok);
    assert.equal((await submitMarketingForm({ publicKey, payload: { kind: "yes", interest: otherAnswer } })).ok, false);
    assert.deepEqual((await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: otherReceipt.data.submissionId }, select: { configuration_snapshot: true } })).configuration_snapshot, otherRow.configuration_snapshot);
    console.log("Public form verified: references, visibility, rating and structured Other answers with immutable snapshots.");
  } finally {
    if (formId) {
      await prisma.audit_logs.deleteMany({ where: { entity_type: "marketing_form", entity_id: formId } });
      await prisma.marketing_forms.delete({ where: { id: formId } });
    }
    for (const id of [leadId, surveyLeadId, visibilityLeadId].filter((value): value is string => Boolean(value))) {
      await prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: id } });
      await prisma.leads.delete({ where: { id } });
    }
    await prisma.$disconnect();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
