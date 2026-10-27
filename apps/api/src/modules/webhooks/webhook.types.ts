import type { SourceGroupCode } from "@admission-crm/shared/source-group";
import { getLeadFieldGroup } from "@admission-crm/shared/lead-field-groups";
import { leadFieldConfigurationCatalog, type LeadSystemField } from "@admission-crm/shared/lead-form-field-catalog";

export const webhookTargetModules = ["LEAD"] as const;
export const webhookStatuses = ["ACTIVE", "DISABLED"] as const;
export const webhookDuplicatePolicies = [
  "CREATE_NEW",
  "UPDATE_EXISTING",
  "REJECT",
] as const;

export type WebhookTargetModule = (typeof webhookTargetModules)[number];
export type WebhookStatus = (typeof webhookStatuses)[number];
export type WebhookDuplicatePolicy = (typeof webhookDuplicatePolicies)[number];

export type WebhookFieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "phone"
  | "select"
  | "multi_select"
  | "province";

export type WebhookSystemFieldMetadata = {
  key: string;
  label: string;
  type: WebhookFieldType;
  requiredByCrm: boolean;
  group: "STANDARD";
  groupKey: string;
  groupLabel: string;
  /** Listed for completeness but filled by the system, never by a mapping. */
  readOnly?: boolean;
  readOnlyReason?: string;
};

/** Source is resolved by name and its group from the URL; program, pipeline stage and admission status need their own workflows. */
const nonMappableLeadFields = new Set([
  "institutionProgramId",
  "pipelineStageId",
  "admissionStatusId",
]);
const requiredLeadFields = new Set(["fullName", "phone", "source"]);
/** Shown in the mapping list so every source field appears, but always derived by the system. */
const systemDerivedFields: Record<string, string> = {
  originId: "Hệ thống tự xác định từ URL nhóm nguồn hoặc nhóm nguồn cố định của webhook.",
};

function toWebhookFieldType(field: LeadSystemField): WebhookFieldType {
  // Nguồn arrives as a name; it is matched to (or added to) the program's Nguồn list when recorded.
  if (field.key === "tags" || field.key === "source") return "string";
  if (field.dataType === "NUMBER") return "number";
  if (field.dataType === "DATE") return "date";
  if (field.dataType === "EMAIL") return "email";
  if (field.dataType === "PHONE") return "phone";
  if (field.dataType === "SELECT") return "select";
  return "string";
}

/** Every Lead field a webhook may write, grouped in the Lead field configuration order. */
export const webhookFieldMetadata: WebhookSystemFieldMetadata[] =
  leadFieldConfigurationCatalog.flatMap((group) =>
    group.fields
      .filter((field) => !nonMappableLeadFields.has(field.key))
      .map((field) => ({
        key: field.key,
        label: field.label,
        type: toWebhookFieldType(field),
        requiredByCrm: requiredLeadFields.has(field.key),
        group: "STANDARD" as const,
        // Source fields (Nguồn học viên, Nhóm nguồn, Nguồn...) share the "Nguồn khách hàng" cluster everywhere.
        groupKey: getLeadFieldGroup(field.key)?.id ?? group.id,
        groupLabel: getLeadFieldGroup(field.key)?.label ?? group.label,
        ...(systemDerivedFields[field.key] ? { readOnly: true, readOnlyReason: systemDerivedFields[field.key] } : {}),
      })),
  );

export type WebhookCrmField = string;
export type WebhookMappingInput = {
  incomingKey: string;
  crmField: string;
  isRequired: boolean;
  defaultValue?: string | null;
};

export type WebhookInput = {
  sourceGroup?: SourceGroupCode | "auto" | null;
  name: string;
  targetModule: WebhookTargetModule;
  status: WebhookStatus;
  duplicatePolicy: WebhookDuplicatePolicy;
  mappings: WebhookMappingInput[];
};

export type WebhookErrorCode =
  | "WEBHOOK_NOT_FOUND"
  | "WEBHOOK_DISABLED"
  | "INVALID_SECRET"
  | "INVALID_JSON"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_FIELD_VALUE"
  | "DUPLICATE_RECORD"
  | "RECORD_CREATE_FAILED"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE";

export type WebhookProcessResult =
  | {
      ok: true;
      status: 200;
      data: {
        record_id: string;
        request_id: string;
        action: "created" | "updated";
        /** CRM fields whose values were stored with a "*" mark because they did not match. */
        unmatched_fields?: string[];
      };
    }
  | {
      ok: false;
      status: number;
      error: {
        code: WebhookErrorCode;
        message: string;
        field?: string;
        duplicate_record_id?: string;
      };
      requestId?: string;
    };
