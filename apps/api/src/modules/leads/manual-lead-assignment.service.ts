import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { getPreference } from "../system/system-preferences.service";
import { findActiveAssignableSale } from "./application/lead-mutation-support";

type Database = Pick<Prisma.TransactionClient, "users" | "system_settings">;

/** This policy only supplies a default for manual creation, never authorizes an explicit assignment. */
export async function getManualLeadAssignmentPolicy(actor: AuthUser, programId: string | null | undefined, database: Database = prisma) {
  if (!programId || !actor.institutionProgramIds.includes(programId)) return { defaultAssigneeId: null, keepUnassigned: false, automationEnabled: false };
  const config = await getPreference(programId, "assignment", database);
  const keepUnassigned = config.manualUnassignedCreatorIds.includes(actor.id);
  const sale = keepUnassigned || !actor.permissions.includes("lead.view_assigned") ? null : await findActiveAssignableSale(database, actor.id, undefined, programId);
  return { defaultAssigneeId: sale?.id ?? null, keepUnassigned, automationEnabled: config.enabled && config.sources.includes("manual") };
}
