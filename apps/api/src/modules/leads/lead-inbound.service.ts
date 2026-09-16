import { prisma } from "../../database/prisma";
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
  constructor(public readonly reason: "custom_field_invalid") {
    super(reason);
  }
}

export async function applyInboundLeadMutation(
  input: MutationInput,
): Promise<MutationResult> {
  let result: Exclude<MutationResult, { reason: "custom_field_invalid" }>;
  try {
    result = await prisma.$transaction(async (tx) => {
      if (input.beforeMutation && !(await input.beforeMutation(tx))) {
        return {
          ok: false as const,
          action: "REJECTED" as const,
          reason: "superseded" as const,
        };
      }
      if (input.duplicatePolicy !== "CREATE_NEW") {
        const lockKey = `inbound-lead:${input.institutionProgramId}:${input.leadInput.phone.trim()}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL AS locked`;
      }

      const duplicate =
        input.duplicatePolicy === "CREATE_NEW"
          ? null
          : await tx.leads.findFirst({
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

      if (duplicate && input.duplicatePolicy === "REJECT") {
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
          input.leadInput,
          input.providedFields,
          input.customFieldValues,
          input.ipAddress,
        );
        if (!updated.ok)
          throw new InboundMutationFailure("custom_field_invalid");
        const completed = {
          ok: true as const,
          action: "UPDATED" as const,
          recordId: duplicate.id,
          duplicateRecordId: duplicate.id,
        };
        await input.onCompleted?.(tx, completed);
        return completed;
      }

      if (!input.canCreate) {
        return {
          ok: false as const,
          action: "REJECTED" as const,
          reason: "missing_create_fields" as const,
        };
      }
      const created = await createLeadInTransaction(
        tx,
        input.actor,
        input.leadInput,
        { allowDuplicate: true, ipAddress: input.ipAddress },
      );
      if (!created.ok)
        return {
          ok: false as const,
          action: "REJECTED" as const,
          reason: "create_failed" as const,
        };
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
    triggerLeadCreatedAutomation(input.actor, input.leadInput, result.created);
  }
  return result;
}
