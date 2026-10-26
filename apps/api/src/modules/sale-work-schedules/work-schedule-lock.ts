import { Prisma } from "../../generated/prisma/client";

export async function lockWorkScheduleProgram(
  tx: Prisma.TransactionClient,
  programId: string,
) {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`sale-work-schedule:${programId}`}))`,
  );
}
