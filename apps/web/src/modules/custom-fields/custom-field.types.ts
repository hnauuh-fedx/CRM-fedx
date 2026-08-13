export const customFieldDataTypes = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "DATE",
  "DATETIME",
  "BOOLEAN",
  "SELECT",
  "MULTI_SELECT",
  "EMAIL",
  "PHONE",
  "PROVINCE",
  "FILE",
] as const;

export type CustomFieldDataType = (typeof customFieldDataTypes)[number];
export type CustomFieldEntityType = "LEAD" | "SALE_ACTIVITY" | "SALE_REMINDER" | "MARKETING_CAMPAIGN" | "MARKETING_FORM" | "ADMISSION_PROFILE" | "ADMISSION_DOCUMENT" | "ADMISSION_STATUS" | "ADMISSION_MAJOR" | "STUDENT";
export type CustomFieldScopeType = "GLOBAL" | "PROGRAM";
export type CustomFieldStatusAction = "activate" | "deactivate" | "archive";
export type CustomFieldGroupDefinition = {
  id: string;
  entityType: CustomFieldEntityType;
  groupKey: string;
  groupLabel: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  displayOrder: number;
  archivedAt: string | null;
  fieldCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CustomFieldGroupSummary = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  displayOrder: number;
};

export type CustomFieldOption = {
  code: string;
  label: string;
  isActive: boolean;
  displayOrder: number;
};

export type CustomFieldDefinition = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  description: string | null;
  entityType: CustomFieldEntityType;
  groupId: string;
  group: CustomFieldGroupSummary;
  scopeType: CustomFieldScopeType;
  programId: string | null;
  fieldType: CustomFieldDataType;
  isRequired: boolean;
  isActive: boolean;
  archivedAt: string | null;
  isSearchable: boolean;
  isFilterable: boolean;
  isSensitive: boolean;
  displayOrder: number;
  options: CustomFieldOption[] | null;
  validationRules: Record<string, unknown> | null;
  defaultValue?: unknown;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CustomFieldInput = {
  fieldKey: string;
  fieldLabel: string;
  description?: string;
  entityType: CustomFieldEntityType;
  groupId: string;
  scopeType: CustomFieldScopeType;
  programId?: string;
  fieldType: CustomFieldDataType;
  isRequired: boolean;
  isSearchable: boolean;
  isFilterable: boolean;
  isSensitive: boolean;
  displayOrder: number;
  options?: CustomFieldOption[];
  validationRules?: Record<string, unknown>;
};

export type CustomFieldUpdateInput = Partial<
  Omit<CustomFieldInput, "fieldKey" | "entityType" | "scopeType" | "programId">
>;

export type CustomFieldGroupInput = {
  entityType: CustomFieldEntityType;
  groupKey: string;
  groupLabel: string;
  description?: string;
  displayOrder: number;
};
