process.env.AUTOMATION_PROCESS_ROLE = "worker";

async function main() {
  const [{ closeAutomationEngine }, { applyAutomationExecutionRetention }, { prisma }, { redisConnection }] = await Promise.all([
    import("../modules/automations/automation-engine.service.js"),
    import("../modules/automations/automation-retention.service.js"),
    import("../database/prisma.js"),
    import("../config/redis.js"),
  ]);
  console.log("Automation worker đã khởi động.");
  const retentionDays = Math.max(7, Number(process.env.AUTOMATION_EXECUTION_RETENTION_DAYS ?? 90) || 90);
  const runRetention = () => void applyAutomationExecutionRetention(retentionDays)
    .catch((error) => console.error("Không thể áp dụng retention cho automation", error));
  runRetention();
  const retentionTimer = setInterval(runRetention, 24 * 60 * 60_000);
  retentionTimer.unref();
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(retentionTimer);
    console.log(`Automation worker nhận ${signal}, đang dừng an toàn...`);
    await closeAutomationEngine();
    await redisConnection?.quit();
    await prisma.$disconnect();
    process.exit(0);
  }
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error) => {
  console.error("Không thể khởi động automation worker", error);
  process.exit(1);
});
