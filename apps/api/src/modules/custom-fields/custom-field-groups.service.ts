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
