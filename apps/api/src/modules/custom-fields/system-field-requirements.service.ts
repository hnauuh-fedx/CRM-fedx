import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";
import { InstitutionProgramScopeError } from "../institutions/institution-program-scope";

const settingPrefix = "form_field_requirements.";

export type SystemFieldRequirements = Record<string, boolean>;

function settingKey(entityType: string) {
  return `${settingPrefix}${entityType}`;
}

function parseRequirements(value?: string | null): SystemFieldRequirements {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    );
  } catch {
    return {};
  }
}

export async function getSystemFieldRequirements(entityType: string) {
  const setting = await prisma.system_settings.findUnique({
    where: { key: settingKey(entityType) },
    select: { value: true },
  });
  return parseRequirements(setting?.value);
}

export async function setSystemFieldRequirement(
  actor: AuthUser,
  entityType: string,
  fieldKey: string,
  isRequired: boolean,
  ipAddress?: string,
) {
  const key = settingKey(entityType);
  if (entityType === "LEAD") {
    const field = leadFormFieldCatalog.flatMap(group => group.fields).find(item => item.key === fieldKey && !item.readOnly);
    if (!field || (field.requiredLocked && !isRequired)) throw new InstitutionProgramScopeError(400, "Trường bắt buộc không hợp lệ hoặc không được phép thay đổi.");
  }
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)) IS NULL AS locked`;
    const previous = await tx.system_settings.findUnique({ where: { key }, select: { value: true } });
    const oldRequirements = parseRequirements(previous?.value);
    const newRequirements = { ...oldRequirements, [fieldKey]: isRequired };
    await tx.system_settings.upsert({
      where: { key },
      update: { value: JSON.stringify(newRequirements), type: "json" },
      create: { key, value: JSON.stringify(newRequirements), type: "json" },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "system_field_requirement",
        action: "update",
        old_data: { entityType, fieldKey, isRequired: oldRequirements[fieldKey] ?? null },
        new_data: { entityType, fieldKey, isRequired },
        ip_address: ipAddress,
      },
    });
    return newRequirements;
  });
}
