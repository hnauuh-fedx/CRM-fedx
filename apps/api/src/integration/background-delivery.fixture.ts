import { prisma } from "../database/prisma";
import { getAuthUser } from "../modules/auth/auth.service";
import { sendAutomationMessage } from "../modules/automations/automation-message-delivery.service";

async function main() {
  if (!/^\/crm_manual_unassign_test_\d+$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error("Isolated database required");
  const [userId, programId, leadId, nodeExecutionId] = process.argv.slice(2);
  try {
    const actor = await getAuthUser(userId, programId);
    if (!actor) throw new Error("Missing test actor");
    await sendAutomationMessage({ actor, leadId, institutionProgramId: programId, nodeExecutionId, channel: "email", content: "Kiểm thử local", consentPolicy: "allow_unknown" });
    process.exitCode = 0;
  } catch { process.exitCode = 2; }
  finally { await prisma.$disconnect(); }
}
void main();
