import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";
import type { Prisma } from "../../generated/prisma/client";
import type { LeadInput } from "./domain/lead-input";

export class LeadRequiredFieldsError extends Error {}
const fields = leadFormFieldCatalog.flatMap(group => group.fields).filter(field => !field.readOnly && !field.requiredLocked);
function hasValue(value: unknown) {
  return value !== null && value !== undefined && (typeof value !== "string" || value.trim().length > 0) && (!Array.isArray(value) || value.length > 0);
}
async function requiredFields(tx: Prisma.TransactionClient) {
  const setting = await tx.system_settings.findUnique({ where: { key: "form_field_requirements.LEAD" }, select: { value: true } });
  let overrides: Record<string, unknown> = {};
  try { overrides = JSON.parse(setting?.value ?? "{}"); } catch { /* Legacy fallback. */ }
  return fields.filter(field => overrides?.[field.key] === true);
}
function checkMissing(missing: string[]) {
  if (missing.length) throw new LeadRequiredFieldsError(`Vui lòng bổ sung trường bắt buộc: ${missing.join(", ")}.`);
}
export async function assertRequiredLeadInput(tx: Prisma.TransactionClient, input: LeadInput) {
  const required = await requiredFields(tx);
  checkMissing(required.filter(field => !hasValue(input[field.key as keyof LeadInput])).map(field => field.label));
}

/** Reads only the related tables needed by configured requirements; the caller already checked mutation scope. */
export async function assertStoredLeadRequirements(tx: Prisma.TransactionClient, leadId: string) {
  const required = await requiredFields(tx);
  if (!required.length) return;
  const needs = (prefix: string) => required.some(field => field.storage.startsWith(prefix));
  const [lead, profile, admission, addresses, relatives, tracking, tags] = await Promise.all([
    needs("leads.") ? tx.leads.findUnique({ where: { id: leadId } }) : null,
    needs("student_profiles.") ? tx.student_profiles.findUnique({ where: { lead_id: leadId } }) : null,
    needs("admission_profiles.") ? tx.admission_profiles.findUnique({ where: { lead_id: leadId } }) : null,
    needs("addresses.") ? tx.addresses.findMany({ where: { lead_id: leadId }, orderBy: { id: "asc" } }) : [],
    needs("relatives.") ? tx.relatives.findMany({ where: { lead_id: leadId }, include: { addresses: true }, orderBy: { id: "asc" } }) : [],
    needs("utm_trackings.") ? tx.utm_trackings.findFirst({ where: { lead_id: leadId } }) : null,
    needs("entity_tags") ? tx.entity_tags.count({ where: { entity_type: "lead", entity_id: leadId } }) : 0,
  ]);
  const addressTypes: Record<string, string> = { specificAddress: "specific", permanentAddress: "permanent", currentResidence: "residence" };
  const values = required.map(field => {
    const [table, column] = field.storage.split(/[ +→]/)[0].split(".");
    let record: Record<string, unknown> | null | undefined;
    if (table === "leads") record = lead;
    else if (table === "student_profiles") record = profile;
    else if (table === "admission_profiles") record = admission;
    else if (table === "utm_trackings") record = tracking;
    else if (table === "addresses") record = addresses.find(item => item.type === (addressTypes[field.key] ?? "current"));
    else if (table === "relatives") {
      const relative = relatives.find(item => item.is_primary === field.key.startsWith("relative1"));
      if (field.key.endsWith("Address")) return { field, value: relative?.addresses?.detail_address };
      record = relative;
    }
    if (field.key === "tags") return { field, value: tags > 0 ? tags : null };
    return { field, value: record?.[column] };
  });
  checkMissing(values.filter(item => !hasValue(item.value)).map(item => item.field.label));
}
