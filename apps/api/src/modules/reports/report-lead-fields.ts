import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";

import { Prisma } from "../../generated/prisma/client";
import { leadFieldFilterDefinitions } from "../leads/lead-field-filter";
import { reportTextSql, type ReportFilterType, type TypedReportCondition } from "./report-filter-conditions";

/**
 * Lead form fields usable as report outputs and filters on Lead datasets. Keys are `LEAD:<field key>`;
 * sensitive fields are excluded because report filters expose their distinct values.
 */

const LEAD_FIELD_PREFIX = "LEAD:";
/** Already report dimensions, or unique per Lead so a category filter is meaningless. */
const excludedFromReports = new Set(["sourceId", "pipelineStageId", "fullName", "note", "gclid"]);

export const reportLeadFilterFields = leadFieldFilterDefinitions
  .filter((field) => !field.isSensitive && !excludedFromReports.has(field.key))
  .map((field) => ({
    key: `${LEAD_FIELD_PREFIX}${field.key}`,
    label: field.label,
    type: field.kind === "date" ? ("DATE" as const) : ("CATEGORY" as const),
    // A Lead can have several tags, so tags cannot be one row/column of a report.
    allowedAsOutput: field.kind !== "list",
    allowedAsFilter: true,
    filterType: (field.kind === "number" ? "number" : field.kind === "date" ? "date" : field.kind === "select" ? "enum" : "text") as ReportFilterType,
  }));

const reportLeadFieldKeys = new Set(reportLeadFilterFields.map((field) => field.key));
const storageByKey = new Map(leadFormFieldCatalog.flatMap((group) => group.fields).map((field) => [field.key, field.storage]));

export function isReportLeadField(fieldKey: string) {
  return reportLeadFieldKeys.has(fieldKey);
}

function leadKey(fieldKey: string) {
  if (!isReportLeadField(fieldKey)) throw new Error("Trường báo cáo không nằm trong danh mục cho phép.");
  return fieldKey.slice(LEAD_FIELD_PREFIX.length);
}

/** Identifiers come from the static catalog, never from request input. */
const identifier = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Cột báo cáo không hợp lệ.");
  return Prisma.raw(`"${name}"`);
};

/** Scalar value of one Lead field for the current `fact` row (NULL when the Lead has none). */
export function reportLeadFieldExpression(fieldKey: string): Prisma.Sql {
  const key = leadKey(fieldKey);
  if (key === "majorId") {
    return Prisma.sql`(SELECT report_major.name FROM majors report_major WHERE report_major.id = COALESCE(
      (SELECT report_profile.major_id FROM admission_profiles report_profile WHERE report_profile.lead_id = fact.lead_id),
      (SELECT report_lead.major_id FROM leads report_lead WHERE report_lead.id = fact.lead_id)))`;
  }
  if (key === "admissionStatusId") {
    return Prisma.sql`(SELECT report_status.name FROM admission_profiles report_profile
      JOIN admission_statuses report_status ON report_status.id = report_profile.admission_status_id
      WHERE report_profile.lead_id = fact.lead_id)`;
  }
  if (key === "gender") {
    return Prisma.sql`(SELECT CASE report_lead.gender WHEN 'male' THEN 'Nam' WHEN 'female' THEN 'Nữ' WHEN 'other' THEN 'Khác' ELSE report_lead.gender END
      FROM leads report_lead WHERE report_lead.id = fact.lead_id)`;
  }
  const match = /^(\w+)\.(\w+)/.exec(storageByKey.get(key) ?? "");
  if (!match) throw new Error("Trường báo cáo không nằm trong danh mục cho phép.");
  const [, table, column] = match;
  if (table === "leads") return Prisma.sql`(SELECT report_lead.${identifier(column)} FROM leads report_lead WHERE report_lead.id = fact.lead_id)`;
  if (table === "student_profiles" || table === "admission_profiles") {
    return Prisma.sql`(SELECT report_row.${identifier(column)} FROM ${identifier(table)} report_row WHERE report_row.lead_id = fact.lead_id LIMIT 1)`;
  }
  if (table === "utm_trackings") {
    return Prisma.sql`(SELECT report_row.${identifier(column)} FROM utm_trackings report_row WHERE report_row.lead_id = fact.lead_id ORDER BY report_row.created_at, report_row.id LIMIT 1)`;
  }
  const relative = /^relative([12])(\w+)$/.exec(key);
  if (table === "relatives" && relative) {
    const which = relative[1] === "1" ? Prisma.sql`report_row.is_primary IS TRUE` : Prisma.sql`report_row.is_primary IS NOT TRUE`;
    return Prisma.sql`(SELECT report_row.${identifier(column)} FROM relatives report_row WHERE report_row.lead_id = fact.lead_id AND ${which} ORDER BY report_row.id LIMIT 1)`;
  }
  throw new Error("Trường báo cáo không nằm trong danh mục cho phép.");
}

const tagExists = (extra: Prisma.Sql) => Prisma.sql`EXISTS (
  SELECT 1 FROM entity_tags report_entity_tag
  JOIN tags report_tag ON report_tag.id = report_entity_tag.tag_id
  WHERE report_entity_tag.entity_type = 'lead' AND report_entity_tag.entity_id = fact.lead_id ${extra})`;

/** SQL for a CATEGORY condition on a Lead field; empty strings count as "no value". */
export function reportLeadCategoryCondition(fieldKey: string, operator: string, value?: string): Prisma.Sql {
  if (leadKey(fieldKey) === "tags") {
    if (operator === "IS_NOT_EMPTY") return tagExists(Prisma.empty);
    if (operator === "IS_EMPTY") return Prisma.sql`NOT ${tagExists(Prisma.empty)}`;
    const named = tagExists(Prisma.sql`AND lower(report_tag.name) = lower(${value ?? ""})`);
    return operator === "NOT_EQUALS" ? Prisma.sql`NOT ${named}` : named;
  }
  const text = Prisma.sql`NULLIF(${reportLeadFieldExpression(fieldKey)}::text, '')`;
  if (operator === "IS_EMPTY") return Prisma.sql`${text} IS NULL`;
  if (operator === "IS_NOT_EMPTY") return Prisma.sql`${text} IS NOT NULL`;
  // Leads without a value also differ from the selected value.
  if (operator === "NOT_EQUALS") return Prisma.sql`${text} IS DISTINCT FROM ${value ?? ""}`;
  return Prisma.sql`${text} = ${value ?? ""}`;
}

export function isReportTagField(fieldKey: string) {
  return isReportLeadField(fieldKey) && leadKey(fieldKey) === "tags";
}

/** Typed condition on tags: text operators match any tag name of the Lead. */
export function reportTagConditionSql(condition: TypedReportCondition): Prisma.Sql {
  if (condition.operator === "HAS_VALUE") return tagExists(Prisma.empty);
  if (condition.operator === "HAS_NO_VALUE") return Prisma.sql`NOT ${tagExists(Prisma.empty)}`;
  const negated = condition.operator === "NOT_CONTAINS" || condition.operator === "NOT_EQUALS";
  const positive = { ...condition, operator: condition.operator === "NOT_CONTAINS" ? "CONTAINS" : condition.operator === "NOT_EQUALS" ? "EQUALS" : condition.operator };
  const named = tagExists(Prisma.sql`AND ${reportTextSql(Prisma.sql`report_tag.name`, positive)}`);
  return negated ? Prisma.sql`NOT ${named}` : named;
}

/** Distinct values of a Lead field among the report rows matched by `where`. */
export function reportLeadFieldValuesQuery(fieldKey: string, from: Prisma.Sql, where: Prisma.Sql): Prisma.Sql {
  if (leadKey(fieldKey) === "tags") {
    return Prisma.sql`
      SELECT report_tag.name AS value, COUNT(DISTINCT fact.lead_id)::bigint AS total
      FROM ${from}
      JOIN entity_tags report_entity_tag ON report_entity_tag.entity_type = 'lead' AND report_entity_tag.entity_id = fact.lead_id
      JOIN tags report_tag ON report_tag.id = report_entity_tag.tag_id
      WHERE ${where}
      GROUP BY report_tag.name ORDER BY total DESC, value ASC LIMIT 100`;
  }
  const text = Prisma.sql`NULLIF(${reportLeadFieldExpression(fieldKey)}::text, '')`;
  return Prisma.sql`
    SELECT field_value.value, COUNT(DISTINCT field_value.lead_id)::bigint AS total
    FROM (SELECT ${text} AS value, fact.lead_id FROM ${from} WHERE ${where}) field_value
    WHERE field_value.value IS NOT NULL
    GROUP BY field_value.value ORDER BY total DESC, field_value.value ASC LIMIT 100`;
}
