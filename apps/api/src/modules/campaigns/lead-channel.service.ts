import { normalizeLeadChannelName, type LeadChannelInput } from "@admission-crm/shared/lead-channel";

import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

/** "Nguồn" values of a program. Separate from Nguồn học viên (lead_sources). */

export type LeadChannelListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: "active" | "inactive";
  institutionProgramId: string;
  sortBy: "createdAt" | "name";
  sortOrder: "asc" | "desc";
};

const channelSelect = {
  id: true,
  name: true,
  is_active: true,
  is_auto_created: true,
  created_at: true,
  updated_at: true,
} as const;

type ChannelRow = Prisma.lead_channelsGetPayload<{ select: typeof channelSelect }>;

function serialize(channel: ChannelRow) {
  return {
    id: channel.id,
    name: channel.name,
    isActive: channel.is_active,
    isAutoCreated: channel.is_auto_created,
    createdAt: channel.created_at.toISOString(),
    updatedAt: channel.updated_at.toISOString(),
  };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function listLeadChannels(query: LeadChannelListQuery) {
  const where: Prisma.lead_channelsWhereInput = {
    institution_program_id: query.institutionProgramId,
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    ...(query.status ? { is_active: query.status === "active" } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.lead_channels.findMany({
      where,
      select: channelSelect,
      orderBy: [{ [query.sortBy === "name" ? "name" : "created_at"]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lead_channels.count({ where }),
  ]);
  return {
    data: items.map(serialize),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: { search: query.search ?? "", status: query.status ?? "" },
  };
}

/** Active values for field pickers (filters, automation conditions). */
export async function listActiveLeadChannelOptions(institutionProgramId: string) {
  const channels = await prisma.lead_channels.findMany({
    where: { institution_program_id: institutionProgramId, is_active: true },
    select: { id: true, name: true, is_auto_created: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 1000,
  });
  return channels.map((channel) => ({ id: channel.id, name: channel.name, isAutoCreated: channel.is_auto_created }));
}

export async function createLeadChannel(actor: AuthUser, input: LeadChannelInput, institutionProgramId: string, ipAddress?: string) {
  const program = await prisma.institution_programs.findFirst({
    where: { id: institutionProgramId, status: "active" },
    select: { id: true },
  });
  if (!program) return { ok: false as const, reason: "program_not_found" as const };
  try {
    return await prisma.$transaction(async (tx) => {
      const channel = await tx.lead_channels.create({
        data: { institution_program_id: institutionProgramId, name: input.name, normalized_name: normalizeLeadChannelName(input.name) },
        select: channelSelect,
      });
      await tx.audit_logs.create({ data: {
        user_id: actor.id,
        entity_type: "lead_channel",
        entity_id: channel.id,
        action: "create",
        ip_address: ipAddress,
        new_data: { name: channel.name, institutionProgramId },
      } });
      return { ok: true as const, data: serialize(channel) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false as const, reason: "duplicate_name" as const };
    throw error;
  }
}

/** Saving a name (even unchanged) confirms an auto-created value, so its "*" mark is removed. */
export async function updateLeadChannel(actor: AuthUser, channelId: string, input: LeadChannelInput, institutionProgramId: string, ipAddress?: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.lead_channels.findFirst({
        where: { id: channelId, institution_program_id: institutionProgramId },
        select: channelSelect,
      });
      if (!current) return { ok: false as const, reason: "not_found" as const };
      if (current.name === input.name && !current.is_auto_created) return { ok: true as const, data: serialize(current) };
      const channel = await tx.lead_channels.update({
        where: { id: channelId },
        data: { name: input.name, normalized_name: normalizeLeadChannelName(input.name), is_auto_created: false, updated_at: new Date() },
        select: channelSelect,
      });
      await tx.audit_logs.create({ data: {
        user_id: actor.id,
        entity_type: "lead_channel",
        entity_id: channel.id,
        action: "update",
        ip_address: ipAddress,
        old_data: { name: current.name, isAutoCreated: current.is_auto_created },
        new_data: { name: channel.name, isAutoCreated: channel.is_auto_created, institutionProgramId },
      } });
      return { ok: true as const, data: serialize(channel) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false as const, reason: "duplicate_name" as const };
    throw error;
  }
}

/** An inactive value stays in the list and on past occurrences but is hidden from field pickers. */
export async function setLeadChannelStatus(actor: AuthUser, channelId: string, isActive: boolean, institutionProgramId: string, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.lead_channels.findFirst({
      where: { id: channelId, institution_program_id: institutionProgramId },
      select: channelSelect,
    });
    if (!current) return { ok: false as const, reason: "not_found" as const };
    if (current.is_active === isActive) return { ok: true as const, data: serialize(current) };
    const channel = await tx.lead_channels.update({
      where: { id: channelId },
      data: { is_active: isActive, updated_at: new Date() },
      select: channelSelect,
    });
    await tx.audit_logs.create({ data: {
      user_id: actor.id,
      entity_type: "lead_channel",
      entity_id: channel.id,
      action: isActive ? "activate" : "deactivate",
      ip_address: ipAddress,
      old_data: { isActive: current.is_active },
      new_data: { isActive: channel.is_active, institutionProgramId },
    } });
    return { ok: true as const, data: serialize(channel) };
  });
}

/**
 * Finds the program's "Nguồn" value matching an inbound name (case-insensitive) or adds it as an
 * auto-created value. Existing values are reused even when inactive, so history stays on one value.
 */
export async function resolveLeadChannel(
  tx: Prisma.TransactionClient,
  input: { institutionProgramId: string; name: string; actorId: string | null; ipAddress?: string },
) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 255);
  if (!name) return null;
  const normalizedName = normalizeLeadChannelName(name);
  const lockKey = `lead-channel:${input.institutionProgramId}:${normalizedName}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL AS locked`;
  const existing = await tx.lead_channels.findUnique({
    where: { institution_program_id_normalized_name: { institution_program_id: input.institutionProgramId, normalized_name: normalizedName } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const channel = await tx.lead_channels.create({
    data: { institution_program_id: input.institutionProgramId, name, normalized_name: normalizedName, is_auto_created: true },
    select: { id: true },
  });
  await tx.audit_logs.create({ data: {
    user_id: input.actorId,
    entity_type: "lead_channel",
    entity_id: channel.id,
    action: "auto_create",
    ip_address: input.ipAddress,
    new_data: { name, institutionProgramId: input.institutionProgramId },
  } });
  return channel.id;
}
