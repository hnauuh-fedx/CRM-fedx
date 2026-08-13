import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import type { CustomFieldGroupInput } from "./custom-fields.types";

const select = {
  id: true,
  entity_type: true,
  group_key: true,
  group_label: true,
  description: true,
  is_system: true,
  is_active: true,
  display_order: true,
  archived_at: true,
  created_at: true,
  updated_at: true,
  _count: { select: { custom_fields: { where: { archived_at: null } } } },
} as const;

const defaultSystemGroups: Record<string, Array<{ id: string; groupKey: string; groupLabel: string; description: string; displayOrder: number }>> = {
  SALE_ACTIVITY: [
    { id: "40000000-0000-4000-8000-000000000001", groupKey: "basic", groupLabel: "Th\u00f4ng tin ho\u1ea1t \u0111\u1ed9ng", description: "Th\u00f4ng tin ch\u00ednh d\u00f9ng \u0111\u1ec3 ghi nh\u1eadn ho\u1ea1t \u0111\u1ed9ng ch\u0103m s\u00f3c lead.", displayOrder: 10 },
    { id: "40000000-0000-4000-8000-000000000002", groupKey: "additional", groupLabel: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng d\u1eef li\u1ec7u t\u1ef1 c\u1ea5u h\u00ecnh cho form ho\u1ea1t \u0111\u1ed9ng sale.", displayOrder: 20 },
  ],
  SALE_REMINDER: [
    { id: "50000000-0000-4000-8000-000000000001", groupKey: "basic", groupLabel: "Th\u00f4ng tin nh\u1eafc vi\u1ec7c", description: "Th\u00f4ng tin ch\u00ednh d\u00f9ng \u0111\u1ec3 t\u1ea1o v\u00e0 theo d\u00f5i nh\u1eafc vi\u1ec7c sale.", displayOrder: 10 },
    { id: "50000000-0000-4000-8000-000000000002", groupKey: "additional", groupLabel: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng d\u1eef li\u1ec7u t\u1ef1 c\u1ea5u h\u00ecnh cho form nh\u1eafc vi\u1ec7c sale.", displayOrder: 20 },
  ],
  MARKETING_CAMPAIGN: [
    { id: "60000000-0000-4000-8000-000000000001", groupKey: "basic", groupLabel: "Th\u00f4ng tin chi\u1ebfn d\u1ecbch", description: "Th\u00f4ng tin ch\u00ednh d\u00f9ng \u0111\u1ec3 t\u1ea1o v\u00e0 theo d\u00f5i chi\u1ebfn d\u1ecbch Marketing.", displayOrder: 10 },
    { id: "60000000-0000-4000-8000-000000000002", groupKey: "additional", groupLabel: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng d\u1eef li\u1ec7u t\u1ef1 c\u1ea5u h\u00ecnh cho form chi\u1ebfn d\u1ecbch Marketing.", displayOrder: 20 },
  ],
  MARKETING_FORM: [
    { id: "63000000-0000-4000-8000-000000000001", groupKey: "basic", groupLabel: "Th\u00f4ng tin Form & Survey", description: "Th\u00f4ng tin ch\u00ednh d\u00f9ng \u0111\u1ec3 c\u1ea5u h\u00ecnh bi\u1ec3u m\u1eabu Marketing.", displayOrder: 10 },
    { id: "63000000-0000-4000-8000-000000000002", groupKey: "additional", groupLabel: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng d\u1eef li\u1ec7u t\u1ef1 c\u1ea5u h\u00ecnh cho Form & Survey.", displayOrder: 20 },
  ],
  ADMISSION_PROFILE: [
    { id: "70000000-0000-4000-8000-000000000001", groupKey: "basic", groupLabel: "Th\u00f4ng tin h\u1ed3 s\u01a1 tuy\u1ec3n sinh", description: "Th\u00f4ng tin ch\u00ednh d\u00f9ng \u0111\u1ec3 t\u1ea1o v\u00e0 x\u1eed l\u00fd h\u1ed3 s\u01a1 tuy\u1ec3n sinh.", displayOrder: 10 },
    { id: "70000000-0000-4000-8000-000000000002", groupKey: "additional", groupLabel: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng d\u1eef li\u1ec7u t\u1ef1 c\u1ea5u h\u00ecnh cho form h\u1ed3 s\u01a1 tuy\u1ec3n sinh.", displayOrder: 20 },
  ],
  ADMISSION_DOCUMENT: [
    { id: "71000000-0000-4000-8000-000000000001", groupKey: "basic", groupLabel: "Th\u00f4ng tin t\u00e0i li\u1ec7u h\u1ed3 s\u01a1", description: "Th\u00f4ng tin ch\u00ednh d\u00f9ng \u0111\u1ec3 upload v\u00e0 ki\u1ec3m tra t\u00e0i li\u1ec7u h\u1ed3 s\u01a1.", displayOrder: 10 },
    { id: "71000000-0000-4000-8000-000000000002", groupKey: "additional", groupLabel: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng d\u1eef li\u1ec7u t\u1ef1 c\u1ea5u h\u00ecnh cho form t\u00e0i li\u1ec7u h\u1ed3 s\u01a1.", displayOrder: 20 },
  ],
  ADMISSION_STATUS: [
    { id: "72000000-0000-4000-8000-000000000001", groupKey: "basic", groupLabel: "Th\u00f4ng tin tr\u1ea1ng th\u00e1i h\u1ed3 s\u01a1", description: "Th\u00f4ng tin ch\u00ednh d\u00f9ng \u0111\u1ec3 khai b\u00e1o tr\u1ea1ng th\u00e1i x\u1eed l\u00fd h\u1ed3 s\u01a1.", displayOrder: 10 },
    { id: "72000000-0000-4000-8000-000000000002", groupKey: "additional", groupLabel: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng d\u1eef li\u1ec7u t\u1ef1 c\u1ea5u h\u00ecnh cho form tr\u1ea1ng th\u00e1i h\u1ed3 s\u01a1.", displayOrder: 20 },
  ],
  ADMISSION_MAJOR: [
    { id: "73000000-0000-4000-8000-000000000001", groupKey: "basic", groupLabel: "Th\u00f4ng tin ng\u00e0nh", description: "Th\u00f4ng tin ch\u00ednh d\u00f9ng \u0111\u1ec3 qu\u1ea3n l\u00fd ng\u00e0nh tuy\u1ec3n sinh.", displayOrder: 10 },
    { id: "73000000-0000-4000-8000-000000000002", groupKey: "additional", groupLabel: "Th\u00f4ng tin b\u1ed5 sung", description: "C\u00e1c tr\u01b0\u1eddng d\u1eef li\u1ec7u t\u1ef1 c\u1ea5u h\u00ecnh cho form ng\u00e0nh tuy\u1ec3n sinh.", displayOrder: 20 },
  ],
};

function serialize(group: any) {
  return {
    id: group.id,
    entityType: group.entity_type,
    groupKey: group.group_key,
    groupLabel: group.group_label,
    description: group.description,
    isSystem: group.is_system,
    isActive: group.is_active,
    displayOrder: group.display_order,
    archivedAt: group.archived_at?.toISOString() ?? null,
    fieldCount: group._count?.custom_fields ?? 0,
    createdAt: group.created_at?.toISOString() ?? null,
    updatedAt: group.updated_at?.toISOString() ?? null,
  };
}

function audit(group: any) {
  return {
    groupId: group.id,
    entityType: group.entity_type,
    groupKey: group.group_key,
    groupLabel: group.group_label,
    isSystem: group.is_system,
    isActive: group.is_active,
    displayOrder: group.display_order,
  };
}

export async function listCustomFieldGroups(query: { entityType: string; includeArchived: boolean }) {
  const defaults = defaultSystemGroups[query.entityType];
  if (defaults) {
    await prisma.$transaction(
      defaults.map((group) =>
        prisma.custom_field_groups.upsert({
          where: { entity_type_group_key: { entity_type: query.entityType, group_key: group.groupKey } },
          create: {
            id: group.id,
            entity_type: query.entityType,
            group_key: group.groupKey,
            group_label: group.groupLabel,
            description: group.description,
            is_system: true,
            is_active: true,
            display_order: group.displayOrder,
          },
          update: {
            group_label: group.groupLabel,
            description: group.description,
            is_system: true,
            is_active: true,
            display_order: group.displayOrder,
          },
        }),
      ),
    );
  }
  const groups = await prisma.custom_field_groups.findMany({
    where: { entity_type: query.entityType, ...(query.includeArchived ? {} : { archived_at: null }) },
    select,
    orderBy: [{ display_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
  });
  return groups.map(serialize);
}

export async function createCustomFieldGroup(actor: AuthUser, input: CustomFieldGroupInput, ipAddress?: string) {
  try {
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.custom_field_groups.create({
        data: {
          entity_type: input.entityType,
          group_key: input.groupKey,
          group_label: input.groupLabel,
          description: input.description,
          is_system: false,
          is_active: true,
          display_order: input.displayOrder,
          created_by_id: actor.id,
          updated_by_id: actor.id,
        },
        select,
      });
      await tx.audit_logs.create({
        data: { user_id: actor.id, entity_type: "custom_field_group", entity_id: created.id, action: "create", ip_address: ipAddress, new_data: audit(created) },
      });
      return created;
    });
    return { ok: true as const, data: serialize(group) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false as const, reason: "duplicate_group_key" as const };
    }
    throw error;
  }
}

export async function updateCustomFieldGroup(actor: AuthUser, id: string, input: { groupLabel?: string; description?: string | null; displayOrder?: number }, ipAddress?: string) {
  const existing = await prisma.custom_field_groups.findUnique({ where: { id }, select });
  if (!existing) return { ok: false as const, reason: "group_not_found" as const };
  if (existing.is_system) return { ok: false as const, reason: "system_group_locked" as const };
  if (existing.archived_at) return { ok: false as const, reason: "group_archived" as const };
  const group = await prisma.$transaction(async (tx) => {
    const updated = await tx.custom_field_groups.update({
      where: { id },
      data: {
        ...(input.groupLabel !== undefined ? { group_label: input.groupLabel } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.displayOrder !== undefined ? { display_order: input.displayOrder } : {}),
        updated_by_id: actor.id,
        updated_at: new Date(),
      },
      select,
    });
    await tx.audit_logs.create({
      data: { user_id: actor.id, entity_type: "custom_field_group", entity_id: id, action: "update", ip_address: ipAddress, old_data: audit(existing), new_data: audit(updated) },
    });
    return updated;
  });
  return { ok: true as const, data: serialize(group) };
}

export async function setCustomFieldGroupStatus(actor: AuthUser, id: string, status: "activate" | "deactivate" | "archive", ipAddress?: string) {
  const existing = await prisma.custom_field_groups.findUnique({ where: { id }, select });
  if (!existing) return { ok: false as const, reason: "group_not_found" as const };
  if (existing.is_system) return { ok: false as const, reason: "system_group_locked" as const };
  if (existing.archived_at) return { ok: false as const, reason: "group_archived" as const };
  if (status === "archive" && existing._count.custom_fields > 0) return { ok: false as const, reason: "group_not_empty" as const };
  const data = status === "archive"
    ? { is_active: false, archived_at: new Date(), updated_by_id: actor.id, updated_at: new Date() }
    : { is_active: status === "activate", updated_by_id: actor.id, updated_at: new Date() };
  const group = await prisma.$transaction(async (tx) => {
    const updated = await tx.custom_field_groups.update({ where: { id }, data, select });
    await tx.audit_logs.create({
      data: { user_id: actor.id, entity_type: "custom_field_group", entity_id: id, action: status, ip_address: ipAddress, old_data: audit(existing), new_data: audit(updated) },
    });
    return updated;
  });
  return { ok: true as const, data: serialize(group) };
}
