process.env.AUTOMATION_PROCESS_ROLE = "api";
async function main() {
  const [{ createReminderWorker }, { prisma }, redis, { closeAutomationEngine }, { zaloQueue }, { metaQueue }, { installWorkerShutdown }, { env }] = await Promise.all([
    import("../modules/leads/reminder-worker.service.js"), import("../database/prisma.js"), import("../config/redis.js"), import("../modules/automations/automation-engine.service.js"),
    import("../modules/integrations/zalo/zalo-queue.service.js"), import("../modules/integrations/meta/meta-queue.service.js"), import("./worker-shutdown.js"), import("../config/env.js"),
  ]);
  const service = createReminderWorker();
  const shutdown = installWorkerShutdown({ name: "reminders", timeoutMs: env.WORKER_SHUTDOWN_TIMEOUT_MS,
    drain: async () => { await service?.worker.close(); },
    close: async () => {
      await Promise.all([service?.queue.close(), closeAutomationEngine(), zaloQueue?.close(), metaQueue?.close()]);
      await redis.redisCommandConnection?.quit(); await redis.redisConnection?.quit(); await prisma.$disconnect();
    },
  });
  try {
    if (!service) { await shutdown("disabled"); return; }
    await service.worker.waitUntilReady(); await service.schedule();
    console.info(JSON.stringify({ event: "reminder_worker_ready", queue: service.worker.name }));
  } catch { await shutdown("startup_failed", 1); }
}
void main().catch(() => { console.error("Không thể khởi động worker nhắc việc."); process.exit(1); });
