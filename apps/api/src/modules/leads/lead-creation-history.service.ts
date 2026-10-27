import { prisma } from "../../database/prisma";
import { leadCreationReferenceNames, recordObject } from "./lead-creation-history";

export const leadCreationActions = ["create", "create_from_marketing_form", "create_from_meta", "create_from_zalo"];

// Only resolve references from an already-authorized Lead's historical snapshots.
// Batch across the audit and activities, preserving names captured at creation time.
export async function resolveLeadCreationNames(creations: unknown[], institutionProgramId: string | null, database = prisma) {
  const values = creations.map((creation) => recordObject(recordObject(creation).initialValues));
  const resolvedNames = new Map<string, Map<string, string>>();
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const hasName = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const load = async (keys: string[], lookup: (ids: string[]) => Promise<Array<{ id: string; name: string }>>) => {
    const ids = [...new Set(values.flatMap((value) => keys.flatMap((key) => {
      const id = value[key];
      return !hasName(value[leadCreationReferenceNames[key]]) && typeof id === "string" && uuid.test(id) ? [id] : [];
    })))];
    if (!ids.length) return;
    const names = new Map((await lookup(ids)).map((row) => [row.id, row.name]));
    for (const key of keys) resolvedNames.set(key, names);
  };
  await Promise.all([
    load(["sourceId"], (ids) => database.lead_sources.findMany({ where: { id: { in: ids }, institution_program_id: institutionProgramId }, select: { id: true, name: true } })),
    load(["originId"], (ids) => institutionProgramId ? database.lead_origins.findMany({ where: { id: { in: ids }, institution_program_id: institutionProgramId }, select: { id: true, name: true } }) : Promise.resolve([])),
    load(["institutionProgramId"], (ids) => database.institution_programs.findMany({ where: { id: { in: ids.filter((id) => id === institutionProgramId) } }, select: { id: true, name: true } })),
    load(["majorId"], (ids) => database.majors.findMany({ where: { id: { in: ids }, institution_program_id: institutionProgramId }, select: { id: true, name: true } })),
    load(["pipelineStageId"], (ids) => database.pipeline_stages.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
    load(["admissionStatusId"], (ids) => database.admission_statuses.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
    load(["assigneeId", "secondaryAssigneeId"], async (ids) => {
      const users = await database.users.findMany({
        where: { id: { in: ids }, ...(institutionProgramId ? { user_program_roles: { some: { institution_program_id: institutionProgramId } } } : {}) },
        select: { id: true, full_name: true },
      });
      return users.map((user) => ({ id: user.id, name: user.full_name }));
    }),
  ]);
  return creations.map((creation, index) => {
    const initialValues = { ...values[index] };
    for (const [idKey, nameKey] of Object.entries(leadCreationReferenceNames)) {
      if (hasName(initialValues[nameKey])) continue;
      const id = initialValues[idKey];
      const name = typeof id === "string" ? resolvedNames.get(idKey)?.get(id) : undefined;
      if (name) initialValues[nameKey] = name;
    }
    return { ...recordObject(creation), initialValues };
  });
}

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
