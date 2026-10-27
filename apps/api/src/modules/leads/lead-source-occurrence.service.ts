import type { Prisma } from "../../generated/prisma/client";
import { resolveLeadChannel } from "../campaigns/lead-channel.service";

type TransactionClient = Prisma.TransactionClient;
export type LeadSourceOccurrence = {
  webhookId?: string;
  requestId: string;
  sourceName: string;
  note?: string;
  details?: Prisma.InputJsonValue;
  receivedAt?: Date;
};
type SourceOccurrenceContext = {
  institutionProgramId: string;
  actorId: string | null;
  ipAddress?: string;
  originName: string;
  sourceOccurrence?: LeadSourceOccurrence;
};

export async function resolveLeadOrigin(
  tx: TransactionClient,
  input: SourceOccurrenceContext,
): Promise<string> {
  const name = input.originName.trim();
  const normalizedName = name.toLowerCase();
  const lockKey = `inbound-origin:${input.institutionProgramId}:${normalizedName}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL AS locked`;
  const existing = await tx.lead_origins.findUnique({
    where: { institution_program_id_normalized_name: {
      institution_program_id: input.institutionProgramId,
      normalized_name: normalizedName,
    } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const origin = await tx.lead_origins.create({
    data: { institution_program_id: input.institutionProgramId, name, normalized_name: normalizedName },
    select: { id: true },
  });
  await tx.audit_logs.create({
    data: {
      user_id: input.actorId,
      entity_type: "lead_origin",
      entity_id: origin.id,
      action: "create",
      ip_address: input.ipAddress,
      new_data: { institutionProgramId: input.institutionProgramId, name },
    },
  });
  return origin.id;
}

export async function recordLeadSourceOccurrence(
  tx: TransactionClient,
  input: SourceOccurrenceContext,
  leadId: string,
  originId: string | undefined,
) {
  if (!originId || !input.sourceOccurrence) return;
  const existing = await tx.lead_source_occurrences.findUnique({
    where: { request_id: input.sourceOccurrence.requestId },
    select: { id: true },
  });
  if (existing) return;
  // "Nguồn" is a program list value; names that match no value are added and marked "*".
  const channelId = await resolveLeadChannel(tx, {
    institutionProgramId: input.institutionProgramId,
    name: input.sourceOccurrence.sourceName,
    actorId: input.actorId,
    ipAddress: input.ipAddress,
  });
  const occurrence = await tx.lead_source_occurrences.create({
    data: {
      lead_id: leadId,
      origin_id: originId,
      channel_id: channelId,
      webhook_id: input.sourceOccurrence.webhookId,
      request_id: input.sourceOccurrence.requestId,
      source_name: input.sourceOccurrence.sourceName,
      note: input.sourceOccurrence.note?.trim() || null,
      details: input.sourceOccurrence.details,
      received_at: input.sourceOccurrence.receivedAt ?? new Date(),
    },
    select: { id: true },
  });
  await tx.audit_logs.create({
    data: {
      user_id: input.actorId,
      entity_type: "lead",
      entity_id: leadId,
      action: "source_received",
      ip_address: input.ipAddress,
      new_data: {
        leadId,
        originId,
        channelId,
        webhookId: input.sourceOccurrence.webhookId,
        requestId: input.sourceOccurrence.requestId,
        sourceName: input.sourceOccurrence.sourceName,
        occurrenceId: occurrence.id,
      },
    },
  });
  await tx.lead_activities.create({
    data: {
      lead_id: leadId,
      user_id: input.actorId,
      type: "source_received",
      content: `Nhận nguồn ${input.sourceOccurrence.sourceName} từ nhóm ${input.originName ?? "Chưa xác định"}.`,
    },
  });
}

