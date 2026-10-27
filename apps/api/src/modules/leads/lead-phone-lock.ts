import type { Prisma } from "../../generated/prisma/client";

export async function lockLeadPhones(tx: Prisma.TransactionClient, programId: string | null | undefined, phone: string, secondaryPhones: string[] = []) {
  for (const number of [...new Set([phone, ...secondaryPhones].map(value => value.trim()).filter(Boolean))].sort()) {
    const key = `lead-phone:${programId}:${number}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key})) IS NULL AS locked`;
  }
}
