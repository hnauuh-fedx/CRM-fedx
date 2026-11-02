import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./database/prisma";
import { redisCommandConnection, redisConnection } from "./config/redis";
import { zaloQueue } from "./modules/integrations/zalo/zalo-queue.service";
import { metaQueue } from "./modules/integrations/meta/meta-queue.service";
import { installWorkerShutdown } from "./workers/worker-shutdown";
import { getWebhookQueueAdapter } from "./modules/webhooks/webhook-queue.service";
import { closeAutomationEngine } from "./modules/automations/automation-engine.service";
import { closeNotificationRealtime } from "./modules/notifications/notification-realtime.service";

const server = app.listen(env.PORT, () => {
  console.log(`Admission CRM API listening on http://localhost:${env.PORT}`);
});

installWorkerShutdown({ name: "api", timeoutMs: env.WORKER_SHUTDOWN_TIMEOUT_MS, drain: async () => {
  // Open notification streams would otherwise hold server.close() until the timeout.
  await closeNotificationRealtime();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}, close: async () => {
  await closeAutomationEngine();
  await Promise.all([zaloQueue?.close(), metaQueue?.close()]);
  await getWebhookQueueAdapter()?.close?.();
  await redisCommandConnection?.quit();
  await redisConnection?.quit();
  await prisma.$disconnect();
} });
