import { prisma } from "../database/prisma";
import { getAuthUser } from "../modules/auth/auth.service";

// Dry-run by default. Usage: tsx ... <program UUID> <actor email> [--apply]
async function main() {
  const [programId, actorEmail, mode] = process.argv.slice(2);
  if (!programId || !actorEmail || (mode && mode !== "--apply")) {
    throw new Error("Usage: assign-shared-lead-sources <program UUID> <actor email> [--apply]");
  }
  const program = await prisma.institution_programs.findFirst({
    where: { id: programId, status: "active" },
    select: { id: true, name: true, code: true },
  });
  if (!program) throw new Error("Active target program not found.");
  const account = await prisma.users.findUnique({ where: { email: actorEmail }, select: { id: true } });
  const actor = account ? await getAuthUser(account.id, program.id) : null;
  if (!actor?.institutionProgramIds.includes(program.id)
    || !actor.permissions.some((permission) => ["lead_source.manage", "system.manage"].includes(permission))) {
    throw new Error("Actor requires source/system management permission in the target program.");
  }
  const sources = await prisma.lead_sources.findMany({
    where: { institution_program_id: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(JSON.stringify({ program, mode: mode ?? "dry-run", sources }));
  if (mode !== "--apply" || sources.length === 0) return;
  await prisma.$transaction(async (tx) => {
    for (const source of sources) {
      const updated = await tx.lead_sources.updateMany({
        where: { id: source.id, institution_program_id: null },
        data: { institution_program_id: program.id },
      });
      if (updated.count !== 1) throw new Error(`Source changed concurrently: ${source.id}`);
      await tx.audit_logs.create({ data: {
        user_id: actor.id,
        entity_type: "lead_source",
        entity_id: source.id,
        action: "update",
        old_data: { name: source.name, institutionProgramId: null },
        new_data: { name: source.name, institutionProgramId: program.id },
      } });
    }
  });
  const count = await prisma.lead_sources.count({ where: { id: { in: sources.map((source) => source.id) }, institution_program_id: program.id } });
  if (count !== sources.length) throw new Error("Assignment verification failed.");
  console.log(`Assigned and verified ${count} sources to ${program.name} (${program.code}); audit records written.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
