import type { AuthUser } from "../auth/auth.types";
import { getLeadCustomFieldDefinitions, getLeadCustomFields } from "../leads/lead-custom-fields.service";
import { getLeadDetail } from "../leads/lead-list.service";

export type AutomationCustomDataField = {
  reference: string;
  id: string;
  key: string;
  label: string;
  description: string | null;
  dataType: string;
  group: { id: string; key: string; label: string };
  isSensitive: boolean;
  options: unknown;
};

const legacySystemFieldAliases: Record<string, string> = {
  source_id: "source.id",
  pipeline_stage_id: "pipelineStage.id",
  assigned_to: "assignee.id",
  institution_program_id: "institutionProgramId",
  full_name: "fullName",
};

const derivedSystemFieldPaths: Record<string, string> = {
  sourceId: "source.id",
  pipelineStageId: "pipelineStage.id",
  assigneeId: "assignee.id",
};

const createTemplateTokenPattern = () => /\{\{\s*([^{}]+?)\s*\}\}/g;

export async function getAutomationCustomDataFields(
  user: AuthUser,
  institutionProgramId: string | null,
): Promise<AutomationCustomDataField[]> {
  const result = await getLeadCustomFieldDefinitions(user, institutionProgramId, false);
  return result.fields
    .filter((field) => field.canView)
    .map((field) => ({
      reference: `custom:${field.id}`,
      id: field.id,
      key: field.code,
      label: field.name,
      description: field.description,
      dataType: field.dataType,
      group: { id: field.group.id, key: field.group.key, label: field.group.label },
      isSensitive: field.isSensitive,
      options: field.options,
    }));
}

export async function getAutomationLeadData(
  user: AuthUser,
  leadId: string,
  institutionProgramId?: string,
  references: string[] = [],
) {
  const needsCustomFields = references.length === 0 || references.some((reference) => reference.startsWith("custom:"));
  const needsSystemFields = references.length === 0 || references.some((reference) => !reference.startsWith("custom:"));
  const [detail, customFields] = await Promise.all([
    needsSystemFields ? getLeadDetail(user, leadId, institutionProgramId) : Promise.resolve(undefined),
    needsCustomFields ? getLeadCustomFields(user, leadId) : Promise.resolve(undefined),
  ]);
  if ((needsSystemFields && !detail) || (needsCustomFields && !customFields)) return null;

  const values = new Map<string, unknown>();
  for (const [key, value] of Object.entries(detail ?? {})) values.set(`system:${key}`, value);
  for (const field of customFields?.fields ?? []) {
    if (field.canView) values.set(`custom:${field.id}`, field.value);
  }
  if (detail) {
    for (const [key, path] of Object.entries(derivedSystemFieldPaths)) {
      values.set(`system:${key}`, readPath(detail, path));
    }
    for (const [legacyKey, path] of Object.entries(legacySystemFieldAliases)) {
      values.set(legacyKey, readPath(detail, path));
    }
    for (const [key, value] of Object.entries(detail)) values.set(key, value);
  }
  return values;
}

export function getAutomationTemplateReferences(...templates: string[]) {
  return templates.flatMap((template) =>
    [...template.matchAll(createTemplateTokenPattern())].map((match) => normalizeTemplateReference(match[1])),
  );
}

export function renderAutomationTemplate(template: string, values: Map<string, unknown>) {
  return template.replace(createTemplateTokenPattern(), (token, reference: string) => {
    const normalizedReference = normalizeTemplateReference(reference);
    if (!values.has(normalizedReference)) return token;
    return formatAutomationFieldValue(values.get(normalizedReference));
  });
}

function normalizeTemplateReference(reference: string) {
  if (reference.startsWith("lead.")) {
    const key = reference.slice("lead.".length);
    return legacySystemFieldAliases[key] ? key : `system:${key}`;
  }
  return reference;
}

function readPath(value: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function formatAutomationFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(formatAutomationFieldValue).filter(Boolean).join(", ");
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["label", "name", "fullName", "fileName", "id"]) {
      if (record[key] !== null && record[key] !== undefined) return String(record[key]);
    }
    return JSON.stringify(value);
  }
  return String(value);
}
