// Isolated integration-only processor. Production entrypoints never import this file.
import { prisma } from "../database/prisma";
import { redisCommandConnection, redisConnection } from "../config/redis";
import { closeIntegrationLocks } from "../modules/integrations/shared/integration-task-receipt";
import { createMetaWorker } from "../modules/integrations/meta/meta-worker.service";
import { metaQueue } from "../modules/integrations/meta/meta-queue.service";
import { zaloQueue } from "../modules/integrations/zalo/zalo-queue.service";
import { closeAutomationEngine } from "../modules/automations/automation-engine.service";
import { installWorkerShutdown } from "../workers/worker-shutdown";

if (!/^\/crm_manual_unassign_test_\d+$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error("Fixture requires generated isolated database");
const worker = createMetaWorker(async id => {
  const message = await prisma.meta_messages.findUniqueOrThrow({ where: { id } });
  await prisma.audit_logs.create({ data: { entity_type: "background_fixture", entity_id: id, action: "effect" } });
  if (message.message_text === "crash") await new Promise(() => {});
  if (message.message_text === "slow") await new Promise(resolve => setTimeout(resolve, 1000));
  await prisma.meta_messages.update({ where: { id }, data: { processing_status: "completed", processed_at: new Date() } });
}, { lockDuration: 1500, stalledInterval: 500 });
if (!worker) throw new Error("Fixture queue unavailable");
installWorkerShutdown({ name: "background_fixture", timeoutMs: 10000,
  drain: () => worker.close(),
  close: async () => {
    await Promise.all([metaQueue?.close(), zaloQueue?.close(), closeAutomationEngine()]);
    await closeIntegrationLocks(); await redisCommandConnection?.quit(); await redisConnection?.quit(); await prisma.$disconnect();
  },
});
process.on("message", message => { if ((message as { type?: string })?.type === "shutdown") process.emit("SIGTERM"); });
void worker.waitUntilReady().then(() => process.send?.({ type: "ready" }));
