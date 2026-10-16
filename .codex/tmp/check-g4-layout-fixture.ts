import { prisma } from "../../apps/api/src/database/prisma";
const id = "6daedff2-482e-4284-9263-de9096ff8c31";
async function run() {
  const form = await prisma.marketing_forms.findFirstOrThrow({ where: { id, name: "[TEST G3] cbf6d7e6-3a01-4fbe-bbca-a304a3dceaef" }, select: { institution_program_id: true, display_settings: true } });
  console.log(JSON.stringify({ submissions: await prisma.marketing_form_submissions.count({ where: { marketing_form_id: id } }), leads: await prisma.leads.count({ where: { institution_program_id: form.institution_program_id } }), audits: await prisma.audit_logs.count({ where: { entity_type: "marketing_form", entity_id: id } }), layout: form.display_settings }));
}
run().finally(() => prisma.$disconnect());
