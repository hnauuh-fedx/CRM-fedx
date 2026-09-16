import { prisma } from "../database/prisma";
import { redisCommandConnection } from "../config/redis";
import { recoverWebhookQueue } from "../modules/webhooks/webhook-operations.service";
import { getWebhookQueueAdapter } from "../modules/webhooks/webhook-queue.service";

async function main() {
  const result = await recoverWebhookQueue();
  console.info(JSON.stringify({ event: "webhook_queue_recovery_completed", ...result }));
}

main()
  .catch((error) => {
    console.error("Webhook queue recovery failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getWebhookQueueAdapter()?.close?.();
    await redisCommandConnection?.quit();
    await prisma.$disconnect();
  });
