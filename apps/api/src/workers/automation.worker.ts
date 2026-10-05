process.env.AUTOMATION_PROCESS_ROLE = "worker";

async function main() {
  const [{ closeAutomationEngine }, { prisma }, { redisConnection }] = await Promise.all([
    import("../modules/automations/automation-engine.service.js"),
    import("../database/prisma.js"),
    import("../config/redis.js"),
  ]);
  console.log("Automation worker đã khởi động.");
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
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
