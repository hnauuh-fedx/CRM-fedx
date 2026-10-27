import { getLeadFieldGroup } from "@admission-crm/shared/lead-field-groups";
import { leadFormFieldCatalog, leadSourceFieldGroup, type LeadSystemField } from "@admission-crm/shared/lead-form-field-catalog";

import type { Prisma } from "../../generated/prisma/client";

/**
 * Filters any Lead form field from the shared catalog, including fields stored outside `leads`
 * (student_profiles, addresses, relatives, admission_profiles, utm_trackings) via relation EXISTS filters.
 */

export type LeadFieldFilterKind = "text" | "number" | "date" | "select" | "list";

export type LeadFieldFilterDefinition = {
  key: string;
  label: string;
  kind: LeadFieldFilterKind;
  isSensitive: boolean;
  groupKey: string;
  groupLabel: string;
  optionSource?: string;
};

export type LeadFieldPredicate =
  | { type: "text"; mode: "contains" | "equals" | "startsWith" | "endsWith"; value: string }
  | { type: "equals"; value: string | number | Date }
  | { type: "range"; gte?: number | Date; gt?: number | Date; lte?: number | Date; lt?: number | Date }
  | { type: "hasValue" };

/** The program is fixed by the list scope; the source group URL is only read while a webhook is received. */
const nonFilterableKeys = new Set(["institutionProgramId", "sourceGroupUrl"]);
/** Lead form fields plus the source data received from webhooks (Nhóm nguồn, Nguồn). */
const filterableGroups = [...leadFormFieldCatalog, leadSourceFieldGroup];

function kindOf(field: LeadSystemField): LeadFieldFilterKind {
  if (field.key === "tags") return "list";
  if (field.dataType === "NUMBER") return "number";
  if (field.dataType === "DATE") return "date";
  if (field.dataType === "SELECT") return "select";
  return "text";
}

export const leadFieldFilterDefinitions: LeadFieldFilterDefinition[] = filterableGroups.flatMap((group) =>
  group.fields
    .filter((field) => !nonFilterableKeys.has(field.key))
    .map((field) => ({
      key: field.key,
      label: field.label,
      kind: kindOf(field),
      // The Lead detail hides every address part without sensitive access, so filters follow it.
      isSensitive: Boolean(field.isSensitive) || field.storage.startsWith("addresses."),
      groupKey: getLeadFieldGroup(field.key)?.id ?? group.id,
      groupLabel: getLeadFieldGroup(field.key)?.label ?? group.label,
      ...(field.optionSource ? { optionSource: field.optionSource } : {}),
    })),
);

const definitionByKey = new Map(leadFieldFilterDefinitions.map((field) => [field.key, field]));
const storageByKey = new Map(filterableGroups.flatMap((group) => group.fields).map((field) => [field.key, field.storage]));

export function getLeadFieldFilterDefinition(key: string) {
  return definitionByKey.get(key);
}

type FieldLocation = {
  column: string;
  /** Column on `leads` itself; negated text filters must then keep NULL rows explicitly. */
  direct: boolean;
  nullable: boolean;
  wrap: (inner: Record<string, unknown>) => Prisma.leadsWhereInput;
};

/** Address fields map to one address record type, matching the Lead form writers. */
const addressTypes: Record<string, string> = {
  specificAddress: "specific",
  permanentAddress: "permanent",
  currentResidence: "residence",
  currentAddress: "current",
  province: "current",
  district: "current",
  ward: "current",
  hamlet: "current",
};
const relativeColumns: Record<string, string> = { FullName: "full_name", Relationship: "relationship", Phone: "phone", Job: "job" };
const requiredLeadColumns = new Set(["full_name", "phone"]);

function locate(key: string): FieldLocation | undefined {
  const storage = storageByKey.get(key);
  const match = storage ? /^(\w+)\.(\w+)/.exec(storage) : null;
  if (!match) return undefined;
  const [, table, column] = match;
  const related = (wrap: FieldLocation["wrap"], name = column): FieldLocation => ({ column: name, direct: false, nullable: true, wrap });
  if (table === "leads") return { column, direct: true, nullable: !requiredLeadColumns.has(column), wrap: (inner) => inner as Prisma.leadsWhereInput };
  if (table === "student_profiles") return related((inner) => ({ student_profiles: { is: inner } }));
  if (table === "admission_profiles") return related((inner) => ({ admission_profiles: { is: inner } }));
  if (table === "utm_trackings") return related((inner) => ({ utm_trackings: { some: inner } }));
  // "Nguồn" is recorded on every source occurrence of the Lead; any occurrence may match.
  if (table === "lead_source_occurrences") return related((inner) => ({ lead_source_occurrences: { some: inner } }));
  if (table === "addresses" && addressTypes[key]) {
    return related((inner) => ({ addresses: { some: { type: addressTypes[key], ...inner } } }));
  }
  const relative = /^relative([12])(\w+)$/.exec(key);
  if (table === "relatives" && relative) {
    // The secondary relative is any non-primary row, as in the Lead detail.
    const which = relative[1] === "1" ? { is_primary: true } : { OR: [{ is_primary: false }, { is_primary: null }] };
    if (relative[2] === "Address") {
      return related((inner) => ({ relatives: { some: { AND: [which, { addresses: { is: inner } }] } } }), "detail_address");
    }
    const relativeColumn = relativeColumns[relative[2]];
    return relativeColumn ? related((inner) => ({ relatives: { some: { AND: [which, inner] } } }), relativeColumn) : undefined;
  }
  return undefined;
}

/** Date-only columns compare calendar days; local midnights are converted to the same UTC day. */
function toDateOnly(value: number | Date | undefined) {
  return value instanceof Date ? new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())) : value;
}

function innerPredicate(column: string, kind: LeadFieldFilterKind, nullable: boolean, direct: boolean, predicate: LeadFieldPredicate): Record<string, unknown> {
  if (predicate.type === "text") return { [column]: { [predicate.mode]: predicate.value, mode: "insensitive" } };
  if (predicate.type === "equals") return { [column]: kind === "date" ? toDateOnly(predicate.value as Date) : predicate.value };
  if (predicate.type === "range") {
    const range = Object.fromEntries(
      (["gte", "gt", "lte", "lt"] as const)
        .filter((operator) => predicate[operator] !== undefined)
        .map((operator) => [operator, kind === "date" ? toDateOnly(predicate[operator]) : predicate[operator]]),
    );
    return { [column]: range };
  }
  if (kind !== "text") return { [column]: { not: null } };
  // SQL `NOT (col = '')` already drops NULL; only nullable `leads` columns spell it out.
  return nullable && direct ? { AND: [{ [column]: { not: null } }, { NOT: { [column]: "" } }] } : { NOT: { [column]: "" } };
}

/** Ngành is stored on the Lead and on its admission profile; either one counts. */
function majorWhere(predicate: LeadFieldPredicate): Prisma.leadsWhereInput {
  if (predicate.type === "hasValue") {
    return { OR: [{ major_id: { not: null } }, { admission_profiles: { is: { major_id: { not: null } } } }] };
  }
  const majorId = String((predicate as { value: unknown }).value);
  return { OR: [{ major_id: majorId }, { admission_profiles: { is: { major_id: majorId } } }] };
}

/**
 * Prisma where for one Lead form field. `negate` turns the predicate into "does not match",
 * which also includes Leads without a stored value.
 */
export function leadFieldWhere(key: string, predicate: LeadFieldPredicate, negate = false): Prisma.leadsWhereInput {
  const definition = definitionByKey.get(key);
  if (!definition || definition.kind === "list") throw new Error(`Trường ${key} không hỗ trợ lọc trực tiếp.`);
  if (key === "majorId") {
    const positive = majorWhere(predicate);
    return negate ? { NOT: positive } : positive;
  }
  const location = locate(key);
  if (!location) throw new Error(`Trường ${key} không hỗ trợ lọc trực tiếp.`);
  const positive = location.wrap(innerPredicate(location.column, definition.kind, location.nullable, location.direct, predicate));
  if (!negate) return positive;
  // SQL NOT drops NULL rows on the same table, so they are added back for "does not contain".
  if (location.direct && location.nullable && predicate.type !== "hasValue") {
    return { OR: [{ [location.column]: null }, { NOT: positive }] };
  }
  return { NOT: positive };
}
