import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";

import type { Prisma } from "../../generated/prisma/client";
import { patchAdmissionInformation } from "../admissions/admission-profile-write.service";
import { patchLeadAttribution } from "../campaigns/lead-attribution.service";
import { patchCandidateInformation } from "../students/candidate-profile.service";

type TransactionClient = Prisma.TransactionClient;

const catalogFields = new Map(leadFormFieldCatalog.flatMap((group) => group.fields).map((field) => [field.key, field]));
/** Lead columns written directly; every other field lives in a related table. */
const leadColumns: Record<string, "cccd" | "temperature"> = { cccd: "cccd", temperature: "temperature" };
const addressTypes: Record<string, string> = {
  specificAddress: "specific", permanentAddress: "permanent", currentResidence: "residence",
  currentAddress: "current", province: "current", district: "current", ward: "current", hamlet: "current",
};

/**
 * Converts submitted text to the stored type of a Lead form field.
 * Returns undefined when the text does not fit the field (invalid number or date).
 */
export function parseLeadFieldText(key: string, text: string): unknown {
  const value = text.trim();
  if (key === "tags") return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  const dataType = catalogFields.get(key)?.dataType;
  if (dataType === "NUMBER") {
    const number = Number(value);
    return value && Number.isFinite(number) ? number : undefined;
  }
  if (dataType === "DATE") {
    const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    const date = day ? new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))) : undefined;
    return date && date.toISOString().slice(0, 10) === day![0] ? date : undefined;
  }
  return value;
}

/** Keys among `keys` whose stored value is still empty, so inbound data only fills gaps. */
export async function findEmptyLeadFields(tx: TransactionClient, leadId: string, keys: string[]) {
  if (!keys.length) return [];
  // Sequential on purpose: queries on one transaction client must not run concurrently.
  const lead = await tx.leads.findUnique({ where: { id: leadId }, select: { cccd: true, temperature: true } });
  const profile = await tx.student_profiles.findUnique({ where: { lead_id: leadId } });
  const admission = await tx.admission_profiles.findUnique({ where: { lead_id: leadId } });
  const addresses = await tx.addresses.findMany({ where: { lead_id: leadId }, orderBy: { id: "asc" } });
  const relatives = await tx.relatives.findMany({ where: { lead_id: leadId }, include: { addresses: true }, orderBy: { id: "asc" } });
  const tracking = await tx.utm_trackings.findFirst({ where: { lead_id: leadId }, orderBy: [{ created_at: "asc" }, { id: "asc" }], select: { gclid: true } });
  const tagCount = await tx.entity_tags.count({ where: { entity_type: "lead", entity_id: leadId } });
  const current = (key: string): unknown => {
    if (key === "tags") return tagCount > 0 ? true : null;
    if (leadColumns[key]) return lead?.[leadColumns[key]];
    const match = /^(\w+)\.(\w+)/.exec(catalogFields.get(key)?.storage ?? "");
    if (!match) return null;
    const [, table, column] = match;
    if (table === "student_profiles") return (profile as Record<string, unknown> | null)?.[column];
    if (table === "admission_profiles") return (admission as Record<string, unknown> | null)?.[column];
    if (table === "utm_trackings") return tracking?.gclid;
    if (table === "addresses") return (addresses.find((address) => address.type === addressTypes[key]) as Record<string, unknown> | undefined)?.[column];
    const relative = /^relative([12])(\w+)$/.exec(key);
    if (table === "relatives" && relative) {
      const row = relatives.find((item) => (relative[1] === "1") === Boolean(item.is_primary));
      return relative[2] === "Address" ? row?.addresses?.detail_address : (row as Record<string, unknown> | undefined)?.[column];
    }
    return null;
  };
  return keys.filter((key) => {
    const value = current(key);
    return value === null || value === undefined || value === "";
  });
}

/** Writes typed Lead form values (from `parseLeadFieldText`) to the Lead and its related tables. */
export async function writeLeadFieldValues(
  tx: TransactionClient,
  leadId: string,
  institutionProgramId: string | null,
  values: Record<string, unknown>,
) {
  const leadData = Object.fromEntries(
    Object.entries(values).filter(([key]) => leadColumns[key]).map(([key, value]) => [leadColumns[key], value]),
  );
  if (Object.keys(leadData).length) await tx.leads.update({ where: { id: leadId }, data: { ...leadData, updated_at: new Date() } });
  const related = Object.fromEntries(Object.entries(values).filter(([key]) => !leadColumns[key]));
  return {
    ...(await patchCandidateInformation(tx, leadId, related)),
    ...(await patchAdmissionInformation(tx, leadId, institutionProgramId, related)),
    ...(await patchLeadAttribution(tx, leadId, related)),
  };
}
