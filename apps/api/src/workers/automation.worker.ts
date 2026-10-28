process.env.AUTOMATION_PROCESS_ROLE = "worker";

async function main() {
  const [{ closeAutomationEngine }, { applyAutomationExecutionRetention }, { prisma }, { redisConnection, redisCommandConnection }, { installWorkerShutdown }, { env }] = await Promise.all([
    import("../modules/automations/automation-engine.service.js"),
    import("../modules/automations/automation-retention.service.js"),
    import("../database/prisma.js"),
    import("../config/redis.js"),
    import("./worker-shutdown.js"),
    import("../config/env.js"),
  ]);
  console.log("Automation worker đã khởi động.");
  const retentionDays = Math.max(7, Number(process.env.AUTOMATION_EXECUTION_RETENTION_DAYS ?? 90) || 90);
  const runRetention = () => void applyAutomationExecutionRetention(retentionDays)
    .catch((error) => console.error("Không thể áp dụng retention cho automation", error));
  runRetention();
  const retentionTimer = setInterval(runRetention, 24 * 60 * 60_000);
  retentionTimer.unref();
  installWorkerShutdown({ name: "automation", timeoutMs: env.WORKER_SHUTDOWN_TIMEOUT_MS, drain: async () => {
    clearInterval(retentionTimer);
    await closeAutomationEngine();
  }, close: async () => {
    await redisCommandConnection?.quit();
    await redisConnection?.quit();
    await prisma.$disconnect();
  } });
}

void main().catch((error) => {
  console.error("Không thể khởi động automation worker", error);
  process.exit(1);
});
