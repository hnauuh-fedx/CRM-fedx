import type {
  CustomFieldDefinition,
  CustomFieldEntityType,
  CustomFieldGroupDefinition,
  CustomFieldGroupInput,
  CustomFieldInput,
  CustomFieldScopeType,
  CustomFieldStatusAction,
  CustomFieldUpdateInput,
} from "@/modules/custom-fields/custom-field.types";
import { apiRequest } from "./api";
import type { LeadCustomFieldsResponse, LeadCustomFieldValue } from "@/modules/leads/lead.types";

export function getCustomFields(
  params: {
    entityType: CustomFieldEntityType;
    scopeType?: CustomFieldScopeType;
    programId?: string;
    includeArchived?: boolean;
  },
  accessToken: string,
) {
  const query = new URLSearchParams({
    entityType: params.entityType,
    includeArchived: String(params.includeArchived ?? false),
  });
  if (params.scopeType) query.set("scopeType", params.scopeType);
  if (params.programId) query.set("programId", params.programId);
  return apiRequest<CustomFieldDefinition[]>(`/custom-fields?${query.toString()}`, {}, accessToken);
}

export function createCustomField(input: CustomFieldInput, accessToken: string) {
  return apiRequest<CustomFieldDefinition>(
    "/custom-fields",
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

export function updateCustomField(id: string, input: CustomFieldUpdateInput, accessToken: string) {
  return apiRequest<CustomFieldDefinition>(
    `/custom-fields/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    accessToken,
  );
}

export function setCustomFieldStatus(id: string, status: CustomFieldStatusAction, accessToken: string) {
  return apiRequest<CustomFieldDefinition>(
    `/custom-fields/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    accessToken,
  );
}

export function getCustomFieldGroups(entityType: CustomFieldEntityType, accessToken: string) {
  const query = new URLSearchParams({ entityType, includeArchived: "false" });
  return apiRequest<CustomFieldGroupDefinition[]>(`/custom-fields/groups?${query.toString()}`, {}, accessToken);
}

export function createCustomFieldGroup(input: CustomFieldGroupInput, accessToken: string) {
  return apiRequest<CustomFieldGroupDefinition>(
    "/custom-fields/groups",
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

export type RuntimeCustomFieldEntityType = "MARKETING_CAMPAIGN" | "MARKETING_FORM" | "ADMISSION_PROFILE" | "ADMISSION_DOCUMENT" | "ADMISSION_STATUS" | "ADMISSION_MAJOR";

export function getRuntimeCustomFields(entityType: RuntimeCustomFieldEntityType, entityId: string | undefined, accessToken: string) {
  const query = entityId ? `?entityId=${encodeURIComponent(entityId)}` : "";
  return apiRequest<LeadCustomFieldsResponse>(`/custom-fields/runtime/${entityType}${query}`, {}, accessToken);
}

export function saveRuntimeCustomFields(entityType: RuntimeCustomFieldEntityType, entityId: string, values: Record<string, LeadCustomFieldValue>, accessToken: string) {
  return apiRequest<{ message: string }>(`/custom-fields/runtime/${entityType}/${entityId}`, { method: "PATCH", body: JSON.stringify({ values }) }, accessToken);
}
