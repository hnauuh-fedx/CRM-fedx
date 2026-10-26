import { resolveLeadOrigin, recordLeadSourceOccurrence, type LeadSourceOccurrence } from "./lead-source-occurrence.service";
import type { LeadCreationSource } from "./lead-creation-history";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "./lead-list.service";
import { saveSaleCustomFieldValues } from "./sale-custom-fields.service";
import {
  createTrustedInboundLeadInTransaction,
  triggerLeadCreatedAutomation,
} from "./application/create-lead.use-case";
import { updateLeadFromInboundInTransaction } from "./application/update-lead.use-case";
import type { LeadInput } from "./domain/lead-input";
import { syncInboundUnmatchedValues, type InboundUnmatchedValues } from "./lead-unmatched-values.service";

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
  creationSource?: LeadCreationSource;
  originName?: string;
  sourceOccurrence?: LeadSourceOccurrence & { webhookId: string };
  providedFields: Set<keyof LeadInput>;
  customFieldValues: InboundLeadCustomFieldValue[];
  /** Raw values that did not match CRM options; stored with a "*" mark on the Lead. */
  unmatchedValues?: InboundUnmatchedValues;
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
          where: {
            id: duplicate.id,
            ...getLeadScopeWhere(input.actor, input.institutionProgramId),
          },
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
        originId = await resolveLeadOrigin(tx, { ...input, actorId: input.actor.id, originName: input.originName });
        leadInput = { ...input.leadInput, originId };
        resolvedLeadInput = leadInput;
      }
      if (duplicate && input.duplicatePolicy === "REJECT") {
        await recordLeadSourceOccurrence(tx, { ...input, actorId: input.actor.id, originName: input.originName ?? "" }, duplicate.id, originId);
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
        await syncInboundUnmatchedValues(tx, input.actor, duplicate.id, input.unmatchedValues, input.ipAddress);
        await recordLeadSourceOccurrence(tx, { ...input, actorId: input.actor.id, originName: input.originName ?? "" }, duplicate.id, originId);
        const completed = {
          ok: true as const,
          action: "UPDATED" as const,
          recordId: duplicate.id,
          duplicateRecordId: duplicate.id,
        };
        await input.onCompleted?.(tx, completed);
        return completed;
      }

      const created = await createTrustedInboundLeadInTransaction(
        tx,
        input.actor,
        leadInput,
        { allowDuplicate: true, allowMissingSource: true, ipAddress: input.ipAddress, creationSource: input.creationSource ?? { channel: "api" } },
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
      await syncInboundUnmatchedValues(tx, input.actor, created.data.id, input.unmatchedValues, input.ipAddress);
      await recordLeadSourceOccurrence(tx, { ...input, actorId: input.actor.id, originName: input.originName ?? "" }, created.data.id, originId);
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
