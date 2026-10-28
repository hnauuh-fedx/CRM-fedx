process.env.AUTOMATION_PROCESS_ROLE = "api";
async function main() {
  const [zalo, meta, { zaloQueue }, { metaQueue }, { closeIntegrationLocks }, { closeAutomationEngine }, { prisma }, redis, { installWorkerShutdown }, { env }] = await Promise.all([
    import("../modules/integrations/zalo/zalo-worker.service.js"), import("../modules/integrations/meta/meta-worker.service.js"),
    import("../modules/integrations/zalo/zalo-queue.service.js"), import("../modules/integrations/meta/meta-queue.service.js"),
    import("../modules/integrations/shared/integration-task-receipt.js"), import("../modules/automations/automation-engine.service.js"),
    import("../database/prisma.js"), import("../config/redis.js"), import("./worker-shutdown.js"), import("../config/env.js"),
  ]);
  const workers = [zalo.createZaloWorker(), meta.createMetaWorker()].filter(worker => worker !== null);
  const shutdown = installWorkerShutdown({ name: "integrations", timeoutMs: env.WORKER_SHUTDOWN_TIMEOUT_MS,
    drain: () => Promise.all(workers.map(worker => worker.close())),
    close: async () => {
      await Promise.all([zaloQueue?.close(), metaQueue?.close(), closeAutomationEngine()]);
      await closeIntegrationLocks(); await redis.redisCommandConnection?.quit(); await redis.redisConnection?.quit(); await prisma.$disconnect();
    },
  });
  try {
    if (!workers.length) { await shutdown("disabled"); return; }
    await Promise.all(workers.map(worker => worker.waitUntilReady()));
    await Promise.all([zalo.scheduleZaloRecovery(), meta.scheduleMetaRecovery()]);
    console.info(JSON.stringify({ event: "integration_workers_ready", queues: workers.map(worker => worker.name) }));
  } catch { await shutdown("startup_failed", 1); }
}
void main().catch(() => { console.error("Không thể khởi động worker tích hợp."); process.exit(1); });
