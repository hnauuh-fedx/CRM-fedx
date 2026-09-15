import { prisma } from "../database/prisma";
import { cleanupExpiredWebhookLogs } from "../modules/webhooks/webhook-retention.service";

async function main() {
  const retentionDays = Number(process.env.WEBHOOK_LOG_RETENTION_DAYS ?? "30");
  const result = await cleanupExpiredWebhookLogs(retentionDays);
  console.log(
    `Deleted ${result.deletedCount} inbound webhook logs older than ${retentionDays} days.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Inbound webhook log cleanup failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
