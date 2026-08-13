import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { vietnamProvinceCodes } from "../custom-fields/vietnam-provinces";
import { getLeadScopeWhere } from "./lead-list.service";

export type SaleCustomFieldEntityType = "SALE_ACTIVITY" | "SALE_REMINDER";
export type RuntimeCustomFieldEntityType = SaleCustomFieldEntityType | "MARKETING_CAMPAIGN" | "MARKETING_FORM" | "ADMISSION_PROFILE" | "ADMISSION_DOCUMENT" | "ADMISSION_STATUS" | "ADMISSION_MAJOR";
export type SaleCustomFieldInput = { fieldId: string; value: unknown };

type Field = Awaited<ReturnType<typeof prisma.custom_fields.findMany>>[number];
type FileValue = { name: string; size: number; type: string; lastModified: number; dataUrl?: string; url?: string };
type Normalized = string | number | boolean | Date | string[] | FileValue[] | null;
type Tx = Prisma.TransactionClient;

const imageFileLimitOptions = new Set([1, 5, 10]);
const typedNulls = { value_text: null, value_number: null, value_date: null, value_boolean: null, value_json: Prisma.JsonNull };

function valueWhere(fieldId: string, entityType: RuntimeCustomFieldEntityType, entityId: string) {
  return { custom_field_id_entity_type_entity_id: { custom_field_id: fieldId, entity_type: entityType, entity_id: entityId } };
}

function serializeGroup(group: any) {
  return {
    id: group.id,
    key: group.group_key,
    label: group.group_label,
    description: group.description,
    isSystem: group.is_system,
    displayOrder: group.display_order,
  };
}

function isFileValue(value: unknown): value is FileValue {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as FileValue).name === "string" && typeof (value as FileValue).size === "number" && typeof (value as FileValue).type === "string" && typeof (value as FileValue).lastModified === "number");
}

function toFileValues(value: unknown): FileValue[] {
  if (Array.isArray(value)) return value.filter(isFileValue);
  return isFileValue(value) ? [value] : [];
}

function getMaxFiles(field: Field) {
  const rules = (field.validation_rules ?? {}) as Record<string, unknown>;
  return typeof rules.maxFiles === "number" && imageFileLimitOptions.has(rules.maxFiles) ? rules.maxFiles : 1;
}

function readValue(field: Field, row: any): Normalized {
  if (!row) return null;
  if (["TEXT", "TEXTAREA", "EMAIL", "PHONE", "SELECT", "PROVINCE"].includes(field.field_type)) return row.value_text;
  if (field.field_type === "NUMBER") return row.value_number === null ? null : Number(row.value_number);
  if (["DATE", "DATETIME"].includes(field.field_type)) return row.value_date;
  if (field.field_type === "BOOLEAN") return row.value_boolean;
  if (field.field_type === "FILE") {
    const files = toFileValues(row.value_json);
    return files.length > 0 ? files : null;
  }
  return Array.isArray(row.value_json) ? row.value_json.filter((value: unknown): value is string => typeof value === "string") : null;
}

function auditValue(field: Field, value: Normalized): Prisma.InputJsonValue {
  if (field.is_sensitive) return { redacted: true, hasValue: value !== null };
  if (value === null) return { cleared: true };
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return value;
}

function normalize(field: Field, raw: unknown): Normalized | null {
  if (raw === null || (typeof raw === "string" && raw.trim() === "")) return null;
  const rules = (field.validation_rules ?? {}) as Record<string, unknown>;
  const options = new Set(((field.options ?? []) as Array<{ code?: unknown; isActive?: unknown }>).filter((option) => option.isActive).map((option) => option.code).filter((code): code is string => typeof code === "string"));

  if (["TEXT", "TEXTAREA"].includes(field.field_type) && typeof raw === "string") {
    const value = raw.trim();
    if ((typeof rules.maxLength === "number" && value.length > rules.maxLength) || (typeof rules.minLength === "number" && value.length < rules.minLength)) return null;
    return value;
  }
  if (field.field_type === "NUMBER" && typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (field.field_type === "BOOLEAN" && typeof raw === "boolean") return raw;
  if (field.field_type === "DATE" && typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00.000Z`);
  if (field.field_type === "DATETIME" && typeof raw === "string" && !Number.isNaN(Date.parse(raw))) return new Date(raw);
  if (field.field_type === "EMAIL" && typeof raw === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return raw.trim().toLowerCase();
  if (field.field_type === "PHONE" && typeof raw === "string" && /^\d{10}$/.test(raw.trim())) return raw.trim();
  if (field.field_type === "PROVINCE" && typeof raw === "string" && vietnamProvinceCodes.has(raw)) return raw;
  if (field.field_type === "FILE") {
    const files = toFileValues(raw).map((file) => ({ name: file.name.trim(), size: file.size, type: file.type, lastModified: file.lastModified, ...(typeof file.dataUrl === "string" && file.dataUrl.startsWith("data:") ? { dataUrl: file.dataUrl } : {}), ...(typeof file.url === "string" && file.url ? { url: file.url } : {}) }));
    if (files.length === 0 || files.length > getMaxFiles(field) || files.some((file) => !file.name || file.size < 0 || file.size > 25 * 1024 * 1024)) return null;
    return files;
  }
  if (field.field_type === "SELECT" && typeof raw === "string" && options.has(raw)) return raw;
  if (field.field_type === "MULTI_SELECT" && Array.isArray(raw) && raw.every((value) => typeof value === "string" && options.has(value)) && new Set(raw).size === raw.length) return raw;
  return null;
}

function applicable(entityType: RuntimeCustomFieldEntityType, programId: string | null) {
  return {
    entity_type: entityType,
    is_active: true,
    archived_at: null,
    custom_field_groups: { is: { is_active: true, archived_at: null } },
    OR: [{ scope_type: "GLOBAL" }, ...(programId ? [{ scope_type: "PROGRAM", program_id: programId }] : [])],
  };
}

async function visibleLead(user: AuthUser, leadId: string, institutionProgramId?: string) {
  return prisma.leads.findFirst({
    where: { id: leadId, deleted_at: null, ...getLeadScopeWhere(user), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) },
    select: { id: true, institution_program_id: true },
  });
}

async function saleEntityContext(user: AuthUser, entityType: SaleCustomFieldEntityType, entityId: string, institutionProgramId?: string) {
  if (entityType === "SALE_ACTIVITY") {
    const activity = await prisma.lead_activities.findFirst({
      where: { id: entityId, leads: { is: { deleted_at: null, ...getLeadScopeWhere(user), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) } } },
      select: { id: true, leads: { select: { institution_program_id: true } } },
    });
    return activity ? { id: activity.id, programId: activity.leads?.institution_program_id ?? null } : null;
  }
  const reminder = await prisma.reminders.findFirst({
    where: { id: entityId, leads: { is: { deleted_at: null, ...getLeadScopeWhere(user), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) } } },
    select: { id: true, leads: { select: { institution_program_id: true } } },
  });
  return reminder ? { id: reminder.id, programId: reminder.leads?.institution_program_id ?? null } : null;
}

function serializeField(field: Field & { custom_field_groups: any }, value: Normalized, user: AuthUser, canEdit: boolean) {
  const viewSensitive = user.permissions.includes("custom_field.view_sensitive");
  return {
    id: field.id,
    code: field.field_key,
    name: field.field_label,
    description: field.description,
    group: serializeGroup(field.custom_field_groups),
    dataType: field.field_type,
    isRequired: field.is_required ?? false,
    isSensitive: field.is_sensitive ?? false,
    displayOrder: field.display_order ?? 0,
    options: field.options,
    validationRules: field.validation_rules,
    defaultValue: field.is_sensitive && !viewSensitive ? undefined : field.default_value,
    value: field.is_sensitive && !viewSensitive ? null : value,
    canView: !field.is_sensitive || viewSensitive,
    canEdit: canEdit && (!field.is_sensitive || user.permissions.includes("custom_field.edit_sensitive")),
  };
}

export async function getSaleCustomFieldDefinitions(user: AuthUser, entityType: SaleCustomFieldEntityType, leadId: string | undefined, canEdit: boolean, institutionProgramId?: string) {
  const lead = leadId ? await visibleLead(user, leadId, institutionProgramId) : null;
  if (leadId && !lead) return null;
  const programId = lead?.institution_program_id ?? institutionProgramId ?? null;
  const fields = await prisma.custom_fields.findMany({
    where: applicable(entityType, programId),
    include: { custom_field_groups: true },
    orderBy: [{ custom_field_groups: { display_order: "asc" } }, { display_order: "asc" }, { id: "asc" }],
  });
  return { fields: fields.map((field) => serializeField(field, readValue(field, null), user, canEdit)) };
}

export async function getSaleCustomFields(user: AuthUser, entityType: SaleCustomFieldEntityType, entityId: string, canEdit: boolean, institutionProgramId?: string) {
  const context = await saleEntityContext(user, entityType, entityId, institutionProgramId);
  if (!context) return null;
  const fields = await prisma.custom_fields.findMany({
    where: applicable(entityType, context.programId),
    include: { custom_field_groups: true, custom_field_values: { where: { entity_type: entityType, entity_id: context.id } } },
    orderBy: [{ custom_field_groups: { display_order: "asc" } }, { display_order: "asc" }, { id: "asc" }],
  });
  return { fields: fields.map((field) => serializeField(field, readValue(field, field.custom_field_values[0]), user, canEdit)) };
}

export async function saveSaleCustomFieldValues(tx: Tx, user: AuthUser, entityType: RuntimeCustomFieldEntityType, entityId: string, programId: string | null, values: SaleCustomFieldInput[], ip?: string) {
  if (values.length === 0) return { ok: true as const };
  const fields = await tx.custom_fields.findMany({ where: { ...applicable(entityType, programId), id: { in: values.map((value) => value.fieldId) } } });
  if (fields.length !== values.length) return { ok: false as const, reason: "not_applicable" as const };

  const map = new Map(fields.map((field) => [field.id, field]));
  const prepared = values.map((value) => ({ field: map.get(value.fieldId)!, value: normalize(map.get(value.fieldId)!, value.value), raw: value.value }));
  if (prepared.some((item) => item.field.is_sensitive && !user.permissions.includes("custom_field.edit_sensitive"))) return { ok: false as const, reason: "sensitive_forbidden" as const };
  if (prepared.some((item) => item.value === null && item.field.is_required) || prepared.some((item) => item.value === null && item.raw !== null && item.raw !== "")) return { ok: false as const, reason: "invalid" as const };

  for (const item of prepared) {
    const old = await tx.custom_field_values.findUnique({ where: valueWhere(item.field.id, entityType, entityId) });
    const oldValue = readValue(item.field, old);
    if (item.value === null) {
      if (old) await tx.custom_field_values.delete({ where: { id: old.id } });
    } else {
      const data: any = { ...typedNulls, custom_field_id: item.field.id, entity_type: entityType, entity_id: entityId, updated_at: new Date(), value: null };
      if (["TEXT", "TEXTAREA", "EMAIL", "PHONE", "SELECT", "PROVINCE"].includes(item.field.field_type)) {
        data.value_text = item.value;
        data.value = item.value;
      } else if (item.field.field_type === "NUMBER") {
        data.value_number = item.value;
      } else if (["DATE", "DATETIME"].includes(item.field.field_type)) {
        data.value_date = item.value;
      } else if (item.field.field_type === "BOOLEAN") {
        data.value_boolean = item.value;
      } else {
        data.value_json = item.value;
      }
      await tx.custom_field_values.upsert({ where: valueWhere(item.field.id, entityType, entityId), create: data, update: data });
    }
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: `${entityType.toLowerCase()}_custom_field`,
        entity_id: entityId,
        action: item.value === null ? "clear" : "update",
        ip_address: ip,
        old_data: { fieldId: item.field.id, fieldCode: item.field.field_key, dataType: item.field.field_type, value: auditValue(item.field, oldValue) },
        new_data: { fieldId: item.field.id, fieldCode: item.field.field_key, dataType: item.field.field_type, value: auditValue(item.field, item.value) },
      },
    });
  }
  return { ok: true as const };
}

async function runtimeEntityContext(user: AuthUser, entityType: RuntimeCustomFieldEntityType, entityId: string, institutionProgramId?: string) {
  if (entityType === "SALE_ACTIVITY" || entityType === "SALE_REMINDER") return saleEntityContext(user, entityType, entityId, institutionProgramId);
  if (entityType === "MARKETING_CAMPAIGN") {
    const row = await prisma.campaigns.findFirst({ where: { id: entityId, ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}), ...(!user.permissions.includes("campaign.view_all") && !user.permissions.includes("campaign.update") ? { created_by: user.id } : {}) }, select: { id: true, institution_program_id: true } });
    return row ? { id: row.id, programId: row.institution_program_id ?? null } : null;
  }
  if (entityType === "MARKETING_FORM") {
    const row = await prisma.marketing_forms.findFirst({ where: { id: entityId, ...(!user.permissions.includes("campaign.view_all") && !user.permissions.includes("marketing_form.manage") ? { created_by: user.id } : {}), ...(institutionProgramId ? { OR: [{ campaigns: { is: { institution_program_id: institutionProgramId } } }, { campaign_id: null }] } : {}) }, select: { id: true, campaigns: { select: { institution_program_id: true } } } });
    return row ? { id: row.id, programId: row.campaigns?.institution_program_id ?? institutionProgramId ?? null } : null;
  }
  if (entityType === "ADMISSION_PROFILE") {
    const row = await prisma.admission_profiles.findFirst({ where: { id: entityId, ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) }, select: { id: true, institution_program_id: true } });
    return row ? { id: row.id, programId: row.institution_program_id ?? null } : null;
  }
  if (entityType === "ADMISSION_DOCUMENT") {
    const row = await prisma.admission_documents.findFirst({ where: { id: entityId, ...(institutionProgramId ? { leads: { is: { institution_program_id: institutionProgramId } } } : {}) }, select: { id: true, leads: { select: { institution_program_id: true } } } });
    return row ? { id: row.id, programId: row.leads?.institution_program_id ?? null } : null;
  }
  if (entityType === "ADMISSION_STATUS") {
    const row = await prisma.admission_statuses.findUnique({ where: { id: entityId }, select: { id: true } });
    return row ? { id: row.id, programId: institutionProgramId ?? null } : null;
  }
  const row = await prisma.majors.findFirst({ where: { id: entityId, ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) }, select: { id: true, institution_program_id: true } });
  return row ? { id: row.id, programId: row.institution_program_id ?? null } : null;
}

export async function getRuntimeCustomFieldDefinitions(user: AuthUser, entityType: RuntimeCustomFieldEntityType, canEdit: boolean, institutionProgramId?: string) {
  const fields = await prisma.custom_fields.findMany({ where: applicable(entityType, institutionProgramId ?? null), include: { custom_field_groups: true }, orderBy: [{ custom_field_groups: { display_order: "asc" } }, { display_order: "asc" }, { id: "asc" }] });
  return { fields: fields.map((field) => serializeField(field, readValue(field, null), user, canEdit)) };
}

export async function getRuntimeCustomFields(user: AuthUser, entityType: RuntimeCustomFieldEntityType, entityId: string, canEdit: boolean, institutionProgramId?: string) {
  const context = await runtimeEntityContext(user, entityType, entityId, institutionProgramId);
  if (!context) return null;
  const fields = await prisma.custom_fields.findMany({ where: applicable(entityType, context.programId), include: { custom_field_groups: true, custom_field_values: { where: { entity_type: entityType, entity_id: context.id } } }, orderBy: [{ custom_field_groups: { display_order: "asc" } }, { display_order: "asc" }, { id: "asc" }] });
  return { fields: fields.map((field) => serializeField(field, readValue(field, field.custom_field_values[0]), user, canEdit)) };
}

export async function saveRuntimeCustomFields(user: AuthUser, entityType: RuntimeCustomFieldEntityType, entityId: string, values: SaleCustomFieldInput[], institutionProgramId?: string, ip?: string) {
  const context = await runtimeEntityContext(user, entityType, entityId, institutionProgramId);
  if (!context) return { ok: false as const, reason: "not_found" as const };
  return prisma.$transaction((tx) => saveSaleCustomFieldValues(tx, user, entityType, context.id, context.programId, values, ip));
}
