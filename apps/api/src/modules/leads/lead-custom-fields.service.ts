import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { vietnamProvinceCodes } from "../custom-fields/vietnam-provinces";
import { getLeadScopeWhere } from "./lead-list.service";

type Input = { fieldId: string; value: unknown };
type Field = Awaited<ReturnType<typeof prisma.custom_fields.findMany>>[number];
type FileValue = { name: string; size: number; type: string; lastModified: number; dataUrl?: string; url?: string };
type Normalized = string | number | boolean | Date | string[] | FileValue[] | null;

const imageFileLimitOptions = new Set([1, 5, 10]);
const leadValueWhere = (fieldId: string, leadId: string) => ({
  custom_field_id_entity_type_entity_id: { custom_field_id: fieldId, entity_type: "LEAD", entity_id: leadId },
});
const typedNulls = { value_text: null, value_number: null, value_date: null, value_boolean: null, value_json: Prisma.JsonNull };

function isFileValue(value: unknown): value is FileValue {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as FileValue).name === "string" &&
      typeof (value as FileValue).size === "number" &&
      typeof (value as FileValue).type === "string" &&
      typeof (value as FileValue).lastModified === "number",
  );
}

function getMaxFiles(field: Field) {
  const rules = (field.validation_rules ?? {}) as Record<string, unknown>;
  const value = rules.maxFiles;
  return typeof value === "number" && imageFileLimitOptions.has(value) ? value : 1;
}

function toFileValues(value: unknown): FileValue[] {
  if (Array.isArray(value)) return value.filter(isFileValue);
  return isFileValue(value) ? [value] : [];
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
  const options = new Set(
    ((field.options ?? []) as Array<{ code?: unknown; isActive?: unknown }>)
      .filter((option) => option.isActive)
      .map((option) => option.code)
      .filter((code): code is string => typeof code === "string"),
  );

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
    const files = toFileValues(raw).map((file) => ({
      name: file.name.trim(),
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      ...(typeof file.dataUrl === "string" && file.dataUrl.startsWith("data:") ? { dataUrl: file.dataUrl } : {}),
      ...(typeof file.url === "string" && file.url ? { url: file.url } : {}),
    }));
    if (files.length === 0) return null;
    if (files.length > getMaxFiles(field)) return null;
    if (files.some((file) => !file.name || file.size < 0 || file.size > 25 * 1024 * 1024)) return null;
    return files;
  }
  if (field.field_type === "SELECT" && typeof raw === "string" && options.has(raw)) return raw;
  if (field.field_type === "MULTI_SELECT" && Array.isArray(raw) && raw.every((value) => typeof value === "string" && options.has(value)) && new Set(raw).size === raw.length) return raw;
  return null;
}

function applicable(programId: string | null) {
  return {
    entity_type: "LEAD",
    is_active: true,
    archived_at: null,
    custom_field_groups: { is: { is_active: true, archived_at: null } },
    OR: [{ scope_type: "GLOBAL" }, ...(programId ? [{ scope_type: "PROGRAM", program_id: programId }] : [])],
  };
}

async function leadFor(user: AuthUser, leadId: string) {
  return prisma.leads.findFirst({
    where: { id: leadId, deleted_at: null, ...getLeadScopeWhere(user) },
    select: { id: true, institution_program_id: true },
  });
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

export async function getLeadCustomFields(user: AuthUser, leadId: string) {
  const lead = await leadFor(user, leadId);
  if (!lead) return null;
  const fields = await prisma.custom_fields.findMany({
    where: applicable(lead.institution_program_id),
    include: { custom_field_groups: true, custom_field_values: { where: { entity_type: "LEAD", entity_id: lead.id } } },
    orderBy: [{ custom_field_groups: { display_order: "asc" } }, { display_order: "asc" }, { id: "asc" }],
  });
  const viewSensitive = user.permissions.includes("custom_field.view_sensitive");
  const canEdit = user.permissions.some((permission) => ["lead.update_all", "lead.update_department", "lead.update_assigned"].includes(permission));
  return {
    fields: fields.map((field) => ({
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
      value: field.is_sensitive && !viewSensitive ? null : readValue(field, field.custom_field_values[0]),
      canView: !field.is_sensitive || viewSensitive,
      canEdit: canEdit && (!field.is_sensitive || user.permissions.includes("custom_field.edit_sensitive")),
    })),
  };
}

export async function getLeadCustomFieldDefinitions(user: AuthUser, programId: string | null, canEdit: boolean) {
  const fields = await prisma.custom_fields.findMany({
    where: applicable(programId),
    include: { custom_field_groups: true },
    orderBy: [{ custom_field_groups: { display_order: "asc" } }, { display_order: "asc" }, { id: "asc" }],
  });
  const viewSensitive = user.permissions.includes("custom_field.view_sensitive");
  return {
    fields: fields.map((field) => ({
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
      value: field.is_sensitive && !viewSensitive ? null : readValue(field, null),
      canView: !field.is_sensitive || viewSensitive,
      canEdit: canEdit && (!field.is_sensitive || user.permissions.includes("custom_field.edit_sensitive")),
    })),
  };
}

export async function patchLeadCustomFields(user: AuthUser, leadId: string, values: Input[], ip?: string) {
  const lead = await leadFor(user, leadId);
  if (!lead) return { ok: false as const, reason: "not_found" };
  if (!user.permissions.some((permission) => ["lead.update_all", "lead.update_department", "lead.update_assigned"].includes(permission))) return { ok: false as const, reason: "forbidden" };

  const fields = await prisma.custom_fields.findMany({ where: { ...applicable(lead.institution_program_id), id: { in: values.map((value) => value.fieldId) } } });
  if (fields.length !== values.length) return { ok: false as const, reason: "not_applicable" };

  const map = new Map(fields.map((field) => [field.id, field]));
  const prepared = values.map((value) => ({ field: map.get(value.fieldId)!, value: normalize(map.get(value.fieldId)!, value.value) }));
  if (prepared.some((item) => item.field.is_sensitive && !user.permissions.includes("custom_field.edit_sensitive"))) return { ok: false as const, reason: "sensitive_forbidden" };
  if (prepared.some((item) => item.value === null && item.field.is_required) || prepared.some((item, index) => item.value === null && values[index].value !== null && values[index].value !== "")) return { ok: false as const, reason: "invalid" };

  await prisma.$transaction(async (tx) => {
    for (const item of prepared) {
      const old = await tx.custom_field_values.findUnique({ where: leadValueWhere(item.field.id, lead.id) });
      const oldValue = readValue(item.field, old);
      if (item.value === null) {
        if (old) await tx.custom_field_values.delete({ where: { id: old.id } });
      } else {
        const data: any = { ...typedNulls, custom_field_id: item.field.id, entity_type: "LEAD", entity_id: lead.id, updated_at: new Date(), value: null };
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
        await tx.custom_field_values.upsert({ where: leadValueWhere(item.field.id, lead.id), create: data, update: data });
      }
      await tx.audit_logs.create({
        data: {
          user_id: user.id,
          entity_type: "lead_custom_field",
          entity_id: lead.id,
          action: item.value === null ? "clear" : "update",
          ip_address: ip,
          old_data: { fieldId: item.field.id, fieldCode: item.field.field_key, dataType: item.field.field_type, value: auditValue(item.field, oldValue) },
          new_data: { fieldId: item.field.id, fieldCode: item.field.field_key, dataType: item.field.field_type, value: auditValue(item.field, item.value) },
        },
      });
    }
  });
  return { ok: true as const };
}
