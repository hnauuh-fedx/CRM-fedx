import { prisma } from "../database/prisma";
import { applyAutomationExecutionRetention } from "../modules/automations/automation-retention.service";

async function main() {
  const configuredDays = Number(process.env.AUTOMATION_EXECUTION_RETENTION_DAYS ?? 90);
  const retentionDays = Number.isInteger(configuredDays) && configuredDays >= 7 ? configuredDays : 90;
  const result = await applyAutomationExecutionRetention(retentionDays);
  console.log(`Đã xóa nội dung nhạy cảm của ${result.count} execution automation cũ hơn ${retentionDays} ngày.`);
}

void main()
  .catch((error) => {
    console.error("Không thể áp dụng retention cho lịch sử automation", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
