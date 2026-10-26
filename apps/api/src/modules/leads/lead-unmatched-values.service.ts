import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";

import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { hasCustomFieldPermission } from "../custom-fields/custom-field-permissions";

type TransactionClient = Prisma.TransactionClient;

/** A raw inbound value that could not be matched to a CRM option or data type. */
export type UnmatchedFieldValue = {
  /** Lead field key (`majorId`) or `custom:<fieldId>`. */
  fieldKey: string;
  label: string;
  rawValue: string;
};

export type InboundUnmatchedValues = {
  values: UnmatchedFieldValue[];
  /** Fields that received a valid value in the same request; their previous `*` marks are cleared. */
  resolvedFieldKeys: string[];
  webhookId?: string;
  requestId?: string;
};

const MAX_RAW_VALUE_LENGTH = 2000;
const sensitiveSystemKeys = new Set(
  leadFormFieldCatalog.flatMap((group) => group.fields).filter((field) => field.isSensitive).map((field) => field.key),
);

export function toUnmatchedRawValue(value: unknown) {
  const text = Array.isArray(value)
    ? value.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ")
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);
  return text.trim().slice(0, MAX_RAW_VALUE_LENGTH);
}

export async function clearResolvedUnmatchedValues(tx: TransactionClient, leadId: string, fieldKeys: Iterable<string>) {
  const keys = [...new Set(fieldKeys)];
  if (!keys.length) return;
  await tx.lead_unmatched_field_values.deleteMany({ where: { lead_id: leadId, field_key: { in: keys } } });
}

/** Stores the latest unmatched raw values of an inbound request and records them on the Lead timeline. */
export async function syncInboundUnmatchedValues(
  tx: TransactionClient,
  actor: AuthUser,
  leadId: string,
  input: InboundUnmatchedValues | undefined,
  ipAddress?: string,
) {
  if (!input) return;
  const unmatchedKeys = new Set(input.values.map((item) => item.fieldKey));
  await clearResolvedUnmatchedValues(tx, leadId, input.resolvedFieldKeys.filter((key) => !unmatchedKeys.has(key)));
  if (!input.values.length) return;
  const now = new Date();
  for (const item of input.values) {
    const data = {
      field_label: item.label.slice(0, 255),
      raw_value: item.rawValue,
      webhook_id: input.webhookId ?? null,
      request_id: input.requestId ?? null,
      updated_at: now,
    };
    await tx.lead_unmatched_field_values.upsert({
      where: { lead_id_field_key: { lead_id: leadId, field_key: item.fieldKey } },
      create: { lead_id: leadId, field_key: item.fieldKey, ...data },
      update: data,
    });
  }
  const labels = input.values.map((item) => item.label).join(", ");
  await tx.lead_activities.create({
    data: {
      lead_id: leadId,
      user_id: actor.id,
      type: "inbound_unmatched_values",
      content: `Webhook gửi giá trị chưa khớp dữ liệu CRM (đánh dấu *): ${labels}.`,
    },
  });
  await tx.audit_logs.create({
    data: {
      user_id: actor.id,
      entity_type: "lead",
      entity_id: leadId,
      action: "inbound_unmatched_values",
      ip_address: ipAddress,
      // Raw values may be sensitive, so the audit keeps field keys only.
      new_data: { fieldKeys: [...unmatchedKeys], webhookId: input.webhookId ?? null, requestId: input.requestId ?? null },
    },
  });
}

/** Unmatched values visible to the viewer; sensitive fields follow the same rules as their stored values. */
export async function listVisibleUnmatchedValues(
  leadId: string,
  user: AuthUser,
  canViewSensitiveLeadData: boolean,
  client: Pick<TransactionClient, "lead_unmatched_field_values" | "custom_fields"> = prisma,
) {
  const rows = await client.lead_unmatched_field_values.findMany({
    where: { lead_id: leadId },
    orderBy: [{ updated_at: "desc" }, { id: "asc" }],
    select: { field_key: true, field_label: true, raw_value: true, updated_at: true },
  });
  const customIds = rows.filter((row) => row.field_key.startsWith("custom:")).map((row) => row.field_key.slice(7));
  const canViewSensitiveCustom = hasCustomFieldPermission(user.permissions, "LEAD", "view_sensitive");
  const hiddenCustomIds = new Set(
    customIds.length && !canViewSensitiveCustom
      ? (await client.custom_fields.findMany({ where: { id: { in: customIds }, is_sensitive: true }, select: { id: true } })).map((field) => field.id)
      : [],
  );
  return rows
    .filter((row) => row.field_key.startsWith("custom:")
      ? !hiddenCustomIds.has(row.field_key.slice(7))
      : canViewSensitiveLeadData || !sensitiveSystemKeys.has(row.field_key))
    .map((row) => ({
      fieldKey: row.field_key,
      label: row.field_label,
      rawValue: row.raw_value,
      receivedAt: row.updated_at.toISOString(),
    }));
}
