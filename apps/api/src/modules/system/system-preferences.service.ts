import { createHash } from "node:crypto";
import { defaultSystemPreferences, preferenceKey, preferenceSchemas, preferenceSections, readPreference, type PreferenceSection, type SystemPreferences } from "@admission-crm/shared/system-preferences";
import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";

type Database = Pick<Prisma.TransactionClient, "system_settings">;
export function preferenceRevision(value: string | null | undefined) {
  return createHash("sha256").update(value ?? "").digest("hex");
}

export async function getPreference<K extends PreferenceSection>(programId: string | null | undefined, section: K, database: Database = prisma): Promise<SystemPreferences[K]> {
  if (!programId) return structuredClone(defaultSystemPreferences[section]);
  const saved = await database.system_settings.findUnique({ where: { key: preferenceKey(programId, section) }, select: { value: true } });
  return readPreference(section, saved?.value);
}

export async function getPreferenceSnapshots(programId: string) {
  const settings = await prisma.system_settings.findMany({
    where: { key: { in: preferenceSections.map(section => preferenceKey(programId, section)) } },
    select: { key: true, value: true },
  });
  return preferenceSections.map(section => {
    const value = settings.find(setting => setting.key === preferenceKey(programId, section))?.value;
    let metadata: { updatedAt?: string; updatedBy?: string } = {};
    try { metadata = (value ? JSON.parse(value) : {}) ?? {}; } catch { /* Keep broken settings available for repair. */ }
    return { section, value: readPreference(section, value), revision: preferenceRevision(value), updatedAt: metadata.updatedAt ?? null, updatedBy: metadata.updatedBy ?? null };
  });
}

export async function savePreference(actor: AuthUser, programId: string, section: PreferenceSection, value: unknown, expectedRevision: string, ipAddress?: string) {
  const parsed = preferenceSchemas[section].parse(value);
  const key = preferenceKey(programId, section);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)) IS NULL AS locked`;
    const existing = await tx.system_settings.findUnique({ where: { key }, select: { id: true, value: true } });
    if (preferenceRevision(existing?.value) !== expectedRevision) return { ok: false as const };
    const document = { version: 1, value: parsed, updatedAt: new Date().toISOString(), updatedBy: actor.fullName };
    const serialized = JSON.stringify(document);
    const saved = await tx.system_settings.upsert({ where: { key }, create: { key, type: "json", value: serialized }, update: { type: "json", value: serialized }, select: { id: true } });
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "system_preference", entity_id: saved.id, action: "update", ip_address: ipAddress,
      old_data: { institutionProgramId: programId, section, value: readPreference(section, existing?.value) },
      new_data: { institutionProgramId: programId, section, value: parsed },
    } });
    return { ok: true as const, snapshot: { section, ...document, revision: preferenceRevision(serialized) } };
  });
}
