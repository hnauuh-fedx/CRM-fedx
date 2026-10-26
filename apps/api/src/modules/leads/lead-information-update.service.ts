import { informationFieldRules, informationReadOnlyReasons, leadInformationSystemFields } from "./lead-information-field-catalog";
import { vietnamProvinces } from "@admission-crm/shared/vietnam-provinces";
import { getLeadCustomFieldGroup, leadFieldGroupOrder } from "@admission-crm/shared/lead-field-groups";
import { patchCandidateInformation } from "../students/candidate-profile.service";
import { patchAdmissionInformation } from "../admissions/admission-profile-write.service";
import { patchLeadAttribution } from "../campaigns/lead-attribution.service";
import { automationInformationUpdatesSchema, validateInformationUpdate, type AutomationWritableField } from "@admission-crm/shared/automation-information-update";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { isEnrolledStudent } from "../students/student-membership";
import { canUpdateLead } from "./application/lead-authorization";
import { getLeadScopeWhere } from "./lead-list.service";
import { getLeadCustomFieldDefinitions } from "./lead-custom-fields.service";
import { saveSaleCustomFieldValues } from "./sale-custom-fields.service";
import { clearResolvedUnmatchedValues } from "./lead-unmatched-values.service";
import { leadPhoneDuplicateWhere } from "./application/lead-mutation-support";

const systemColumns = {
  fullName: "full_name", phone: "phone", email: "email", gender: "gender", dateOfBirth: "date_of_birth", note: "note",
  cccd: "cccd", sourceId: "source_id", originId: "origin_id", majorId: "major_id", leadScore: "lead_score", temperature: "temperature", secondaryPhones: "secondary_phones",
} as const;
type CatalogClient = Pick<Prisma.TransactionClient, "custom_fields" | "lead_sources" | "lead_origins" | "majors">;

export async function getLeadWritableFields(actor: AuthUser, programId: string | null, client: CatalogClient = prisma): Promise<AutomationWritableField[]> {
  if (!canUpdateLead(actor) || actor.accessScope === "READ_ONLY") return [];
  const [custom, sources, origins, majors] = await Promise.all([
    getLeadCustomFieldDefinitions(actor, programId, true, client),
    client.lead_sources.findMany({ where: { OR: [{ institution_program_id: programId }, { institution_program_id: null }] }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    programId ? client.lead_origins.findMany({ where: { institution_program_id: programId }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }) : Promise.resolve([]),
    client.majors.findMany({ where: { OR: [{ institution_program_id: programId }, { institution_program_id: null }] }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
  ]);
  const referenceOptions = { sourceId: sources, originId: origins, majorId: majors };
  const systemFields: AutomationWritableField[] = leadInformationSystemFields
    .filter((field) => !field.isSensitive || actor.permissions.includes("lead.sensitive.view"))
    .map((field) => ({
      reference: `system:${field.key}`, key: field.key, label: field.label, description: field.note ?? null,
      dataType: ["tags", "secondaryPhones"].includes(field.key) ? "STRING_LIST" : field.dataType, groupKey: field.groupKey, groupLabel: field.groupLabel, source: "system" as const,
      isSensitive: Boolean(field.isSensitive), canClear: !field.isRequired && !/^relative[12]FullName$/.test(field.key),
      readOnlyReason: informationReadOnlyReasons[field.key] ?? (field.groupKey === "admission" && !actor.permissions.includes("admission.update") ? "Bạn cần quyền cập nhật hồ sơ tuyển sinh để sửa trường này." : undefined),
      options: field.key === "gender" ? [{ code: "male", label: "Nam" }, { code: "female", label: "Nữ" }, { code: "other", label: "Khác" }]
        : (referenceOptions[field.key as keyof typeof referenceOptions] ?? []).map((option) => ({ code: option.id, label: option.name })),
      validationRules: informationFieldRules(field.key),
    }));
  const customFields = custom.fields.filter((field) => field.canView && field.canEdit)
    .map((field): AutomationWritableField => ({
      reference: `custom:${field.id}`, key: field.code, label: field.name, description: field.description,
      dataType: field.dataType, groupKey: getLeadCustomFieldGroup(field.group).id, groupLabel: getLeadCustomFieldGroup(field.group).label,
      source: "custom", isSensitive: field.isSensitive, canClear: !field.isRequired,
      validationRules: (field.validationRules ?? {}) as Record<string, unknown>,
      options: field.dataType === "PROVINCE" ? [...vietnamProvinces] : Array.isArray(field.options) ? field.options.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        return item.isActive === true && typeof item.code === "string" && typeof item.label === "string" ? [{ code: item.code, label: item.label }] : [];
      }) : [],
    }));
  // Custom fields sit inside the Lead form cluster of their group, after that cluster's system fields.
  return [...systemFields, ...customFields]
    .map((field, index) => ({ field, index }))
    .sort((left, right) => leadFieldGroupOrder(left.field.groupKey) - leadFieldGroupOrder(right.field.groupKey) || left.index - right.index)
    .map(({ field }) => field);
}

/** The caller runs this inside the same transaction as its execution checkpoint. */
type InformationUpdateRecord = { activityContent: (changedCount: number) => string; auditAction: string; ipAddress?: string };
const automationUpdateRecord: InformationUpdateRecord = {
  activityContent: (changedCount) => `Automation cập nhật ${changedCount} trường thông tin.`,
  auditAction: "automation_update_information",
};

export async function updateLeadInformationInTransaction(tx: Prisma.TransactionClient, actor: AuthUser, leadId: string, rawUpdates: unknown, programId?: string, record: InformationUpdateRecord = automationUpdateRecord) {
  if (!canUpdateLead(actor) || actor.accessScope === "READ_ONLY") throw new Error("Không có quyền cập nhật Lead.");
  if (programId && !actor.institutionProgramIds.includes(programId)) throw new Error("Không có quyền cập nhật chương trình này.");
  const parsed = automationInformationUpdatesSchema.safeParse(rawUpdates);
  if (!parsed.success) throw new Error("Cấu hình cập nhật thông tin không hợp lệ.");
  // Serialize against the existing lead update/assignment path and concurrent automation nodes.
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`lead-assignment:${leadId}`}))`);
  const writeScope = actor.permissions.includes("lead.update_all") ? {} : getLeadScopeWhere({
    ...actor,
    permissions: [actor.permissions.includes("lead.update_department") ? "lead.view_department" : "lead.view_assigned"],
  }, programId);
  const lead = await tx.leads.findFirst({
    where: { id: leadId, deleted_at: null, AND: [getLeadScopeWhere(actor, programId), writeScope], ...(programId ? { institution_program_id: programId } : {}) },
    select: { id: true, institution_program_id: true, full_name: true, phone: true, secondary_phones: true, email: true, gender: true, date_of_birth: true, note: true, cccd: true, source_id: true, origin_id: true, major_id: true, lead_score: true, temperature: true, students: { select: { status: true } } },
  });
  if (!lead) throw new Error("Lead không tồn tại hoặc ngoài phạm vi cập nhật.");
  if (lead.institution_program_id && !actor.institutionProgramIds.includes(lead.institution_program_id)) throw new Error("Không có quyền cập nhật chương trình này.");
  if (isEnrolledStudent(lead.students) && !actor.permissions.some((permission) => ["student.update", "student.update_all"].includes(permission))) {
    throw new Error("Không có quyền cập nhật dữ liệu của sinh viên đã nhập học.");
  }
  const fields = new Map((await getLeadWritableFields(actor, lead.institution_program_id, tx)).map((field) => [field.reference, field]));
  const data: Prisma.leadsUpdateInput = {};
  const oldData: Record<string, Prisma.InputJsonValue> = {};
  const newData: Record<string, Prisma.InputJsonValue> = {};
  const customValues: Array<{ fieldId: string; value: unknown }> = [];
  const relatedValues: Record<string, unknown> = {};
  for (const update of parsed.data) {
    const field = fields.get(update.field);
    if (!field) throw new Error("Trường cập nhật không còn khả dụng hoặc không có quyền chỉnh sửa.");
    const invalid = validateInformationUpdate(update, field);
    if (invalid) throw new Error(`${field.label}: ${invalid}`);
    let value: unknown = update.operation === "clear" ? null : update.value!;
    if (typeof value === "string") value = ["SELECT", "PROVINCE", "DATE", "DATETIME"].includes(field.dataType) ? value : value.trim();
    if (field.dataType === "EMAIL" && typeof value === "string") value = value.toLowerCase();
    if (field.dataType === "STRING_LIST" && Array.isArray(value)) value = value.map((item) => String(item).trim());
    if (field.source === "custom") {
      customValues.push({ fieldId: update.field.slice(7), value });
      continue;
    }
    const next = field.dataType === "DATE" && typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value;
    relatedValues[field.key] = next;
    if (!Object.hasOwn(systemColumns, field.key)) continue;
    const column = systemColumns[field.key as keyof typeof systemColumns];
    const storedNext = column === "secondary_phones" ? (next ?? []) : next;
    if (JSON.stringify(lead[column]) === JSON.stringify(storedNext)) continue;
    Object.assign(data, { [column]: storedNext });
    const auditValue = (input: unknown): Prisma.InputJsonValue => field.isSensitive ? { redacted: true, hasValue: input !== null } : input instanceof Date ? input.toISOString() : input === null ? { cleared: true } : input as Prisma.InputJsonValue;
    oldData[update.field] = auditValue(lead[column]);
    newData[update.field] = auditValue(storedNext);
  }
  if (Object.hasOwn(data, "phone") || Object.hasOwn(data, "secondary_phones")) {
    const phone = (data.phone as string | undefined) ?? lead.phone;
    const secondary = ((data.secondary_phones as string[] | undefined) ?? lead.secondary_phones).filter((number) => number !== phone);
    for (const number of [...new Set([phone, ...secondary])].sort()) await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`lead-phone:${lead.institution_program_id}:${number}`}))`);
    const duplicate = await tx.leads.findFirst({ where: { ...leadPhoneDuplicateWhere({ phone, secondaryPhones: secondary }), deleted_at: null, id: { not: lead.id }, institution_program_id: lead.institution_program_id }, select: { id: true } });
    if (duplicate) throw new Error("Số điện thoại đã tồn tại trong chương trình.");
    data.secondary_phones = secondary;
    if (JSON.stringify(lead.secondary_phones) !== JSON.stringify(secondary)) {
      oldData["system:secondaryPhones"] = { redacted: true, hasValue: lead.secondary_phones.length > 0 };
      newData["system:secondaryPhones"] = { redacted: true, hasValue: secondary.length > 0 };
    } else {
      delete oldData["system:secondaryPhones"];
      delete newData["system:secondaryPhones"];
    }
  }
  const relatedChanges = {
    ...await patchCandidateInformation(tx, lead.id, relatedValues),
    ...await patchAdmissionInformation(tx, lead.id, lead.institution_program_id, relatedValues),
    ...await patchLeadAttribution(tx, lead.id, relatedValues),
  };
  for (const [key, change] of Object.entries(relatedChanges)) {
    const reference = `system:${key}`;
    if (Object.hasOwn(newData, reference)) continue;
    const audit = (value: unknown): Prisma.InputJsonValue => fields.get(reference)?.isSensitive ? { redacted: true, hasValue: value !== null && value !== undefined } : value instanceof Date ? value.toISOString() : value === null || value === undefined ? { cleared: true } : value as Prisma.InputJsonValue;
    oldData[reference] = audit(change.before);
    newData[reference] = audit(change.after);
  }
  // The existing custom-field writer enforces applicability, sensitive-edit permission and typed storage.
  const customResult = await saveSaleCustomFieldValues(tx, actor, "LEAD", lead.id, lead.institution_program_id, customValues, undefined, true);
  if (!customResult.ok) throw new Error("Không thể cập nhật trường tùy chỉnh; kiểm tra quyền và giá trị.");
  await clearResolvedUnmatchedValues(tx, lead.id, parsed.data
    .filter((update) => update.operation !== "clear" && update.field.startsWith("system:"))
    .map((update) => update.field.slice(7)));
  const changedFields = [...Object.keys(newData), ...customResult.changedFieldIds.map((id) => `custom:${id}`)];
  if (changedFields.length) {
    await tx.leads.update({ where: { id: lead.id }, data: { ...data, updated_at: new Date() } });
    await tx.lead_activities.create({ data: { lead_id: lead.id, user_id: actor.id, type: "lead_updated", content: record.activityContent(changedFields.length) } });
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "lead", entity_id: lead.id, action: record.auditAction, ip_address: record.ipAddress, old_data: oldData, new_data: { ...newData, changedFields } } });
  }
  return { changedFields };
}
