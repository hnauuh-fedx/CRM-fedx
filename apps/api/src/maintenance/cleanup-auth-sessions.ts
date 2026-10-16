import { prisma } from "../database/prisma";

async function main() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const where = { OR: [{ revoked_at: { lt: cutoff } }, { expires_at: { lt: cutoff } }] };
  if (!process.argv.includes("--apply")) {
    const count = await prisma.auth_sessions.count({ where });
    console.log(`${count} expired/revoked sessions eligible after 30 days. Use --apply to delete at most 1000. Active remembered sessions and audit logs are retained.`);
    return;
  }
  // Small batches keep maintenance from holding large locks. Recheck eligibility
  // at deletion time; this command has no public endpoint or ordinary UI action.
  const candidates = await prisma.auth_sessions.findMany({ where, select: { id: true }, take: 1000 });
  const result = await prisma.auth_sessions.deleteMany({ where: { ...where, id: { in: candidates.map((row) => row.id) } } });
  console.log(`Deleted ${result.count} expired/revoked sessions; audit logs retained.`);
}

void main().catch((error) => { console.error("Auth session cleanup failed.", error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
