import { Prisma } from "../../generated/prisma/client";

import { prisma } from "../../database/prisma";

export function applyAutomationExecutionRetention(retentionDays = 90, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60_000);
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
      SELECT pg_try_advisory_xact_lock(hashtext('automation_execution_retention')) AS acquired
    `);
    if (!lock?.acquired) return { count: 0, executionCount: 0, nodeCount: 0, skipped: true };
    const [executions, nodes] = await Promise.all([
      tx.automation_execution_logs.updateMany({
        where: {
          started_at: { lt: cutoff },
          OR: [{ context_data: { not: Prisma.DbNull } }, { error_message: { not: null } }],
        },
        data: { context_data: Prisma.DbNull, error_message: null },
      }),
      tx.automation_node_executions.updateMany({
        where: {
          error_message: { not: null },
          automation_execution_logs: { started_at: { lt: cutoff } },
        },
        data: { error_message: null },
      }),
    ]);
    return {
      count: executions.count + nodes.count,
      executionCount: executions.count,
      nodeCount: nodes.count,
      skipped: false,
    };
  });
}
