export const customFieldEntityTypes = ["LEAD", "ADMISSION_PROFILE", "STUDENT"] as const;
export const customFieldDataTypes = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "DATETIME", "BOOLEAN", "SELECT", "MULTI_SELECT", "EMAIL", "PHONE"] as const;
export const customFieldScopeTypes = ["GLOBAL", "PROGRAM"] as const;
export type CustomFieldEntityType = typeof customFieldEntityTypes[number];
export type CustomFieldDataType = typeof customFieldDataTypes[number];
export type CustomFieldScopeType = typeof customFieldScopeTypes[number];
export type CustomFieldOption = { code: string; label: string; isActive: boolean; displayOrder: number };
export type CustomFieldInput = { fieldKey: string; fieldLabel: string; description?: string; entityType: CustomFieldEntityType; scopeType: CustomFieldScopeType; programId?: string; fieldType: CustomFieldDataType; isRequired: boolean; isSearchable: boolean; isFilterable: boolean; isSensitive: boolean; displayOrder: number; options?: CustomFieldOption[]; validationRules?: Record<string, unknown>; defaultValue?: unknown };
