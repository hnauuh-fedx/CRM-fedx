import type { AuthUser } from "../auth/auth.types";

export function serializeCustomField(field: any, actor: AuthUser) {
  const sensitive = field.is_sensitive ?? false;
  const canViewSensitive = actor.permissions.includes("custom_field.view_sensitive");
  return { id: field.id, fieldKey: field.field_key, fieldLabel: field.field_label, description: field.description, entityType: field.entity_type, scopeType: field.scope_type, programId: field.program_id, fieldType: field.field_type, isRequired: field.is_required ?? false, isActive: field.is_active ?? true, archivedAt: field.archived_at?.toISOString() ?? null, isSearchable: sensitive ? false : field.is_searchable ?? false, isFilterable: sensitive ? false : field.is_filterable ?? false, isSensitive: sensitive, displayOrder: field.display_order ?? 0, options: field.options, validationRules: field.validation_rules, defaultValue: sensitive && !canViewSensitive ? undefined : field.default_value, createdAt: field.created_at?.toISOString() ?? null, updatedAt: field.updated_at?.toISOString() ?? null };
}
