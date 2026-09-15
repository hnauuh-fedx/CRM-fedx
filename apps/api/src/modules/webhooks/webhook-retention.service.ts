import { prisma } from "../../database/prisma";

export async function cleanupExpiredWebhookLogs(
  retentionDays = 30,
  now = new Date(),
  webhookId?: string,
) {
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 365
  ) {
    throw new Error("Webhook log retention must be between 1 and 365 days.");
  }

  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.webhook_requests.deleteMany({
    where: {
      received_at: { lt: cutoff },
      ...(webhookId ? { webhook_id: webhookId } : {}),
    },
  });

  console.info(
    JSON.stringify({
      event: "inbound_webhook_log_cleanup",
      retention_days: retentionDays,
      deleted_count: result.count,
      cutoff: cutoff.toISOString(),
    }),
  );

  return { deletedCount: result.count, cutoff };
}
