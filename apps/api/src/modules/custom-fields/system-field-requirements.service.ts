import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

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
  const oldRequirements = await getSystemFieldRequirements(entityType);
  const newRequirements = { ...oldRequirements, [fieldKey]: isRequired };

  await prisma.$transaction([
    prisma.system_settings.upsert({
      where: { key },
      update: { value: JSON.stringify(newRequirements), type: "json" },
      create: { key, value: JSON.stringify(newRequirements), type: "json" },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "system_field_requirement",
        action: "update",
        old_data: { entityType, fieldKey, isRequired: oldRequirements[fieldKey] ?? null },
        new_data: { entityType, fieldKey, isRequired },
        ip_address: ipAddress,
      },
    }),
  ]);

  return newRequirements;
}
