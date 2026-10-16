import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma";
import { createMarketingForm, getMarketingFormById, updateMarketingForm, duplicateMarketingForm, publishMarketingForm, rotateMarketingFormWebhookSecret, createMarketingFormField, updateMarketingFormField, deleteMarketingFormField, reorderMarketingFormFields, deleteMarketingForm } from "../modules/campaigns/marketing-form-management.service";
import { listMarketingForms, listMarketingFormSubmissions, getMarketingFormFilterOptions } from "../modules/campaigns/marketing-reference.service";
import { submitMarketingForm } from "../modules/campaigns/marketing-form-public.service";
import type { MarketingFormViewer } from "../modules/campaigns/marketing-form-scope";
import { getRuntimeCustomFields, saveRuntimeCustomFields } from "../modules/leads/sale-custom-fields.service";
import type { AuthUser } from "../modules/auth/auth.types";
import { listMarketingFormReferenceCatalog } from "../modules/campaigns/marketing-form-reference-catalog.service";

async function run() {
  const suffix = randomUUID();
  const programIds = [randomUUID(), randomUUID()];
  const formIds: string[] = [];
  const leadIds: string[] = [];
  const sourceIds: string[] = [];
  const majorIds: string[] = [];
  try {
    const owner = await prisma.users.findFirstOrThrow({ where: { email: "director@tvu.edu.vn" }, select: { id: true } });
    for (const [index, id] of programIds.entries()) {
      await prisma.institution_programs.create({ data: { id, code: `TEST-FORM-${suffix}-${index}`, name: "[TEST] Form scope", institution_name: "[TEST]", status: "active" } });
      const source = await prisma.lead_sources.create({ data: { name: `[TEST] Form source ${suffix}`, institution_program_id: id }, select: { id: true } });
      sourceIds.push(source.id);
      const major = await prisma.majors.create({ data: { name: `[TEST] Form major ${suffix}`, institution_program_id: id }, select: { id: true } });
      majorIds.push(major.id);
    }
    const actor = (program: string): MarketingFormViewer => ({ id: owner.id, institutionProgramIds: [program], accessScope: "ALL", departmentIds: [], permissions: ["campaign.view_all", "marketing_form.manage"] });
    const first = actor(programIds[0]), second = actor(programIds[1]);
    for (const target of ["major_id", "source_id"] as const) {
      const catalog = await listMarketingFormReferenceCatalog(first, programIds[0], { target, page: 1, limit: 1, search: suffix });
      assert.ok(catalog.ok);
      if (catalog.ok) {
        assert.equal(catalog.data.pagination.total, 1);
        assert.equal(catalog.data.data[0].value, target === "major_id" ? majorIds[0] : sourceIds[0]);
        assert.equal(catalog.data.data[0].label.includes(suffix), true);
      }
      assert.equal((await listMarketingFormReferenceCatalog(first, programIds[1], { target, page: 1, limit: 10 })).ok, false);
    }
    const input = {
      name: `[TEST] Form ${suffix}`, status: "published" as const, sourceId: sourceIds[0],
      fields: [
        { fieldKey: "name", label: "Họ tên", fieldType: "text" as const, isRequired: true, crmMappingField: "full_name" as const, sortOrder: 0, isActive: true },
        { fieldKey: "phone", label: "Điện thoại", fieldType: "phone" as const, isRequired: true, crmMappingField: "phone" as const, sortOrder: 1, isActive: true },
        { fieldKey: "program", label: "Chương trình", fieldType: "text" as const, isRequired: false, crmMappingField: "institution_program_id" as const, sortOrder: 2, isActive: true },
      ],
    };
    const created = await createMarketingForm(first, input, programIds[0]);
    assert.ok(created.ok);
    formIds.push(created.data.id);
    const id = created.data.id;
    const runtimeActor = (program: string): AuthUser => ({ ...actor(program), institutionProgramIds: [program], email: "fixture@example.com", fullName: "[TEST]", roles: [], avatarUrl: null });
    assert.ok(await getRuntimeCustomFields(runtimeActor(programIds[0]), "MARKETING_FORM", id, true, programIds[0]));
    assert.equal(await getRuntimeCustomFields(runtimeActor(programIds[1]), "MARKETING_FORM", id, true, programIds[1]), null, "Custom fields không được đi qua lỗ hổng campaign_id NULL.");
    assert.equal((await saveRuntimeCustomFields(runtimeActor(programIds[1]), "MARKETING_FORM", id, [], programIds[1])).ok, false);
    assert.equal((await getMarketingFormById(first, id)).ok, true, "Form không campaign phải đọc được trong chương trình.");
    assert.equal((await getMarketingFormById(second, id)).ok, false);
    const ownOnly = { ...first, id: randomUUID(), accessScope: "OWNED_ONLY" as const };
    assert.equal((await getMarketingFormById(ownOnly, id)).ok, false, "Permission rộng không vượt owned scope.");
    assert.equal((await createMarketingForm(first, input, programIds[1])).ok, false, "Không tạo qua chương trình không được cấp.");
    assert.equal((await createMarketingForm(first, { ...input, sourceId: sourceIds[1] }, programIds[0])).ok, false);
    const listQuery = { page: 1, limit: 20, sortBy: "createdAt" as const, sortOrder: "desc" as const };
    assert.equal((await listMarketingForms(first, listQuery)).data.some((row) => row.id === id), true);
    assert.equal((await listMarketingForms(second, listQuery)).pagination.total, 0);
    assert.equal((await listMarketingFormSubmissions(second, id, { page: 1, limit: 20 })).ok, false);
    assert.deepEqual((await getMarketingFormFilterOptions(second, programIds[1])).statuses, []);
    assert.equal((await updateMarketingForm(second, id, { ...input, sourceId: sourceIds[1] }, programIds[1])).ok, false);
    assert.equal((await deleteMarketingForm(second, id)).ok, false);
    assert.equal((await duplicateMarketingForm(second, id)).ok, false);
    assert.equal((await publishMarketingForm(second, id)).ok, false);
    assert.equal((await rotateMarketingFormWebhookSecret(second, id)).ok, false);
    assert.equal((await createMarketingFormField(second, id, { fieldKey: "extra", label: "Khảo sát", fieldType: "text", isRequired: false, isActive: true, sortOrder: 3 })).ok, false);
    const field = await prisma.marketing_form_fields.findFirstOrThrow({ where: { marketing_form_id: id } });
    assert.equal((await updateMarketingFormField(second, field.id, input.fields[0])).ok, false);
    assert.equal((await deleteMarketingFormField(second, field.id)).ok, false);
    assert.equal((await reorderMarketingFormFields(second, id, [field.id])).ok, false);
    const copied = await duplicateMarketingForm(first, id);
    assert.ok(copied.ok);
    formIds.push(copied.data.id);
    assert.equal((await prisma.marketing_forms.findUniqueOrThrow({ where: { id: copied.data.id } })).institution_program_id, programIds[0]);

    const phone = `096${Date.now().toString().slice(-7)}`;
    const outside = await prisma.leads.create({ data: { lead_code: `TEST-${suffix}`, full_name: "[TEST] Outside program", phone, source_id: sourceIds[1], institution_program_id: programIds[1] }, select: { id: true } });
    leadIds.push(outside.id);
    const mismatched = await submitMarketingForm({ publicKey: created.data.public_key!, payload: { name: "[TEST] Scope", phone, program: programIds[1] } });
    assert.equal(mismatched.ok, false);
    if (!mismatched.ok) assert.equal(mismatched.status, 400);
    const submission = await submitMarketingForm({ publicKey: created.data.public_key!, payload: { name: "[TEST] Scope", phone } });
    assert.ok(submission.ok);
    assert.equal("leadId" in submission.data, false);
    const submittedLeadId = (await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: submission.data.submissionId } })).lead_id;
    assert.ok(submittedLeadId);
    leadIds.push(submittedLeadId);
    assert.notEqual(submittedLeadId, outside.id, "Trùng số ở chương trình khác không liên kết nhầm.");
    const lead = await prisma.leads.findUniqueOrThrow({ where: { id: submittedLeadId } });
    assert.equal(lead.institution_program_id, programIds[0]);
    assert.equal(lead.source_id, sourceIds[0]);
    const duplicate = await submitMarketingForm({ publicKey: created.data.public_key!, payload: { name: "[TEST] Scope again", phone } });
    assert.ok(duplicate.ok);
    assert.equal((await prisma.marketing_form_submissions.findUniqueOrThrow({ where: { id: duplicate.data.submissionId } })).lead_id, lead.id);
    console.log("PASS: no-campaign form, scope CRUD/fields/options/submissions, duplicate scope, program locking and configured source.");
  } finally {
    await prisma.audit_logs.deleteMany({ where: { OR: [{ entity_type: "marketing_form", entity_id: { in: formIds } }, { entity_type: "lead", entity_id: { in: leadIds } }] } });
    await prisma.marketing_forms.deleteMany({ where: { id: { in: formIds } } });
    await prisma.leads.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.lead_sources.deleteMany({ where: { id: { in: sourceIds } } });
    await prisma.majors.deleteMany({ where: { id: { in: majorIds } } });
    await prisma.institution_programs.deleteMany({ where: { id: { in: programIds } } });
    await prisma.$disconnect();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
