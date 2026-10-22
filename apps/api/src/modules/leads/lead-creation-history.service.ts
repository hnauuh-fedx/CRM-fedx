import { prisma } from "../../database/prisma";
import { recordObject } from "./lead-creation-history";

export const leadCreationActions = ["create", "create_from_marketing_form", "create_from_meta", "create_from_zalo"];

// Call only after the scoped Lead lookup succeeds. Never return raw request payloads or secrets.
export async function loadLeadCreationHistory(leadId: string, database = prisma) {
  const audit = await database.audit_logs.findFirst({
    where: { entity_type: "lead", entity_id: leadId, action: { in: leadCreationActions } },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true, action: true, new_data: true, users: { select: { full_name: true } } },
  });
  const data = recordObject(audit?.new_data);
  if (recordObject(data.creation).channel) return { auditId: audit?.id, creation: data.creation };
  // Only CREATED is evidence of origin; a later webhook update must never reclassify a manual Lead.
  const request = await database.webhook_requests.findFirst({
    where: { record_id: leadId, action: "CREATED" },
    orderBy: [{ received_at: "asc" }, { id: "asc" }],
    select: { webhook_id: true, request_id: true, config_snapshot: true, mapped_payload: true, webhooks: { select: { name: true } } },
  });
  if (request) return { auditId: audit?.id, creation: {
    channel: "webhook", webhookId: request.webhook_id, requestId: request.request_id,
    webhookName: recordObject(request.config_snapshot).webhookName ?? request.webhooks.name,
    initialValues: request.mapped_payload ?? data,
  } };
  if (audit?.action === "create_from_marketing_form") {
    const submission = await database.marketing_form_submissions.findFirst({
      where: { lead_id: leadId, marketing_form_id: typeof data.marketingFormId === "string" ? data.marketingFormId : undefined, status: "processed" },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: { source: true, marketing_form_id: true, normalized_payload: true, configuration_snapshot: true, marketing_forms: { select: { name: true } } },
    });
    const values = recordObject(submission?.normalized_payload);
    return { auditId: audit.id, creation: {
      channel: submission?.source === "webhook" ? "webhook" : "public_form", formId: data.marketingFormId,
      formName: recordObject(submission?.configuration_snapshot).formName ?? submission?.marketing_forms.name,
      initialValues: { ...data, fullName: values.full_name, phone: values.phone, email: values.email, gender: values.gender, dateOfBirth: values.date_of_birth, note: values.note, majorId: values.major_id },
    } };
  }
  if (audit?.action === "create_from_meta" || audit?.action === "create_from_zalo") return {
    auditId: audit.id, creation: { channel: "api", webhookName: audit.action === "create_from_meta" ? "Facebook Messenger" : "Zalo OA", initialValues: data },
  };
  return { auditId: audit?.id, creation: { channel: "unknown", creatorName: audit?.users?.full_name, initialValues: data } };
}
