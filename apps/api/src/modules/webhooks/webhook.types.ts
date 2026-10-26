import type { SourceGroupCode } from "@admission-crm/shared/source-group";
import { leadFormFieldCatalog, type LeadSystemField } from "@admission-crm/shared/lead-form-field-catalog";

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
};

/** Source is resolved by name; program, pipeline stage and admission status need their own workflows. */
const nonMappableLeadFields = new Set([
  "sourceId",
  "institutionProgramId",
  "pipelineStageId",
  "admissionStatusId",
]);
const requiredLeadFields = new Set(["fullName", "phone", "source"]);

function toWebhookFieldType(field: LeadSystemField): WebhookFieldType {
  if (field.key === "tags") return "string";
  if (field.dataType === "NUMBER") return "number";
  if (field.dataType === "DATE") return "date";
  if (field.dataType === "EMAIL") return "email";
  if (field.dataType === "PHONE") return "phone";
  if (field.dataType === "SELECT") return "select";
  return "string";
}

/** Every Lead form field a webhook may write, grouped in Lead form order. */
export const webhookFieldMetadata: WebhookSystemFieldMetadata[] =
  leadFormFieldCatalog.flatMap((group) => {
    const toMetadata = (key: string, label: string, type: WebhookFieldType) => ({
      key,
      label,
      type,
      requiredByCrm: requiredLeadFields.has(key),
      group: "STANDARD" as const,
      groupKey: group.id,
      groupLabel: group.label,
    });
    return group.fields.flatMap((field) => {
      if (nonMappableLeadFields.has(field.key)) return [];
      const metadata = toMetadata(field.key, field.label, toWebhookFieldType(field));
      return field.key === "phone"
        ? [
            metadata,
            toMetadata("source", "Nguồn", "string"),
            toMetadata("sourceGroupUrl", "URL xác định nhóm nguồn", "string"),
          ]
        : [metadata];
    });
  });

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
