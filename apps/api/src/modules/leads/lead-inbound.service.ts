import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "./lead-list.service";
import { saveSaleCustomFieldValues } from "./sale-custom-fields.service";
import {
  createLeadInTransaction,
  triggerLeadCreatedAutomation,
  updateLeadFromInboundInTransaction,
  type LeadInput,
} from "./lead-management.service";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type InboundLeadDuplicatePolicy =
  | "CREATE_NEW"
  | "UPDATE_EXISTING"
  | "REJECT";
export type InboundLeadAction = "CREATED" | "UPDATED" | "REJECTED";
export type InboundLeadCustomFieldValue = { fieldId: string; value: unknown };

type MutationInput = {
  actor: AuthUser;
  institutionProgramId: string;
  duplicatePolicy: InboundLeadDuplicatePolicy;
  leadInput: LeadInput;
  originName?: string;
  sourceOccurrence?: {
    webhookId: string;
    requestId: string;
    sourceName: string;
    note?: string;
    details?: Prisma.InputJsonValue;
    receivedAt?: Date;
  };
  providedFields: Set<keyof LeadInput>;
  customFieldValues: InboundLeadCustomFieldValue[];
  canCreate: boolean;
  ipAddress?: string;
  enforceActorScope?: boolean;
  beforeMutation?: (tx: TransactionClient) => Promise<boolean>;
  onCompleted?: (
    tx: TransactionClient,
    result: Extract<MutationResult, { ok: true }>,
  ) => Promise<void>;
};

type MutationResult =
  | {
      ok: true;
      action: "CREATED";
      recordId: string;
      created: { id: string; assigneeId: string | null };
    }
  | { ok: true; action: "UPDATED"; recordId: string; duplicateRecordId: string }
  | {
      ok: false;
      action: "REJECTED";
      duplicateRecordId: string;
      reason: "duplicate";
    }
  | {
      ok: false;
      action: "REJECTED";
      reason:
        | "create_failed"
        | "custom_field_invalid"
        | "missing_create_fields"
        | "duplicate_forbidden"
        | "superseded";
    };

class InboundMutationFailure extends Error {
  constructor(public readonly reason: "custom_field_invalid" | "create_failed") {
    super(reason);
  }
}

async function resolveInboundOrigin(
  tx: TransactionClient,
  input: MutationInput,
): Promise<string> {
  const name = input.originName!.trim();
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
      user_id: input.actor.id,
      entity_type: "lead_origin",
      entity_id: origin.id,
      action: "create",
      ip_address: input.ipAddress,
      new_data: { institutionProgramId: input.institutionProgramId, name },
    },
  });
  return origin.id;
}

async function recordSourceOccurrence(
  tx: TransactionClient,
  input: MutationInput,
  leadId: string,
  originId: string | undefined,
) {
  if (!originId || !input.sourceOccurrence) return;
  const existing = await tx.lead_source_occurrences.findUnique({
    where: { request_id: input.sourceOccurrence.requestId },
    select: { id: true },
  });
  if (existing) return;
  const occurrence = await tx.lead_source_occurrences.create({
    data: {
      lead_id: leadId,
      origin_id: originId,
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
      user_id: input.actor.id,
      entity_type: "lead",
      entity_id: leadId,
      action: "source_received",
      ip_address: input.ipAddress,
      new_data: {
        leadId,
        originId,
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
      user_id: input.actor.id,
      type: "source_received",
      content: `Nhận nguồn ${input.sourceOccurrence.sourceName} từ nhóm ${input.originName ?? "Chưa xác định"}.`,
    },
  });
}

export async function applyInboundLeadMutation(
  input: MutationInput,
): Promise<MutationResult> {
  let result: MutationResult;
  let resolvedLeadInput = input.leadInput;
  try {
    result = await prisma.$transaction(async (tx) => {
      if (input.beforeMutation && !(await input.beforeMutation(tx))) {
        return {
          ok: false as const,
          action: "REJECTED" as const,
          reason: "superseded" as const,
        };
      }
      const lockKey = `inbound-lead:${input.institutionProgramId}:${input.leadInput.phone.trim()}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL AS locked`;

      const duplicate = await tx.leads.findFirst({
              where: {
                institution_program_id: input.institutionProgramId,
                phone: input.leadInput.phone.trim(),
                deleted_at: null,
              },
              orderBy: [{ created_at: "asc" }, { id: "asc" }],
              select: { id: true },
            });

      if (duplicate && input.enforceActorScope) {
        const visibleDuplicate = await tx.leads.findFirst({
          where: { id: duplicate.id, ...getLeadScopeWhere(input.actor) },
          select: { id: true },
        });
        if (!visibleDuplicate) {
          return {
            ok: false as const,
            action: "REJECTED" as const,
            reason: "duplicate_forbidden" as const,
          };
        }
      }

      if (!duplicate && !input.canCreate) {
        return {
          ok: false as const,
          action: "REJECTED" as const,
          reason: "missing_create_fields" as const,
        };
      }
      let leadInput = input.leadInput;
      let originId: string | undefined;
      if (input.originName) {
        originId = await resolveInboundOrigin(tx, input);
        leadInput = { ...input.leadInput, originId };
        resolvedLeadInput = leadInput;
      }
      if (duplicate && input.duplicatePolicy === "REJECT") {
        await recordSourceOccurrence(tx, input, duplicate.id, originId);
        return {
          ok: false as const,
          action: "REJECTED" as const,
          duplicateRecordId: duplicate.id,
          reason: "duplicate" as const,
        };
      }
      if (duplicate) {
        const updated = await updateLeadFromInboundInTransaction(
          tx,
          input.actor,
          duplicate.id,
          input.institutionProgramId,
          leadInput,
          input.providedFields,
          input.customFieldValues,
          input.ipAddress,
        );
        if (!updated.ok)
          throw new InboundMutationFailure("custom_field_invalid");
        await recordSourceOccurrence(tx, input, duplicate.id, originId);
        const completed = {
          ok: true as const,
          action: "UPDATED" as const,
          recordId: duplicate.id,
          duplicateRecordId: duplicate.id,
        };
        await input.onCompleted?.(tx, completed);
        return completed;
      }

      const created = await createLeadInTransaction(
        tx,
        input.actor,
        leadInput,
        { allowDuplicate: true, allowMissingSource: true, ipAddress: input.ipAddress },
      );
      if (!created.ok) throw new InboundMutationFailure("create_failed");
      const customResult = await saveSaleCustomFieldValues(
        tx,
        input.actor,
        "LEAD",
        created.data.id,
        input.institutionProgramId,
        input.customFieldValues,
        input.ipAddress,
      );
      if (!customResult.ok)
        throw new InboundMutationFailure("custom_field_invalid");
      await recordSourceOccurrence(tx, input, created.data.id, originId);
      const completed = {
        ok: true as const,
        action: "CREATED" as const,
        recordId: created.data.id,
        created: created.data,
      };
      await input.onCompleted?.(tx, completed);
      return completed;
    });
  } catch (error) {
    if (error instanceof InboundMutationFailure) {
      return { ok: false, action: "REJECTED", reason: error.reason };
    }
    throw error;
  }

  if (result.ok && result.action === "CREATED") {
    triggerLeadCreatedAutomation(input.actor, resolvedLeadInput, result.created);
  }
  return result;
}
