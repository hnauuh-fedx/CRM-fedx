import { prisma } from "../../apps/api/src/database/prisma";
const marker = "466d33e4-bc2a-433f-8f99-0308c2897052";
async function run() {
  const forms = await prisma.marketing_forms.findMany({ where: { name: { contains: marker } }, select: { id: true, name: true } });
  const leads = await prisma.leads.findMany({ where: { full_name: { contains: marker } }, select: { id: true } });
  console.log(JSON.stringify({ forms, leadIds: leads.map((lead) => lead.id) }));
  if (process.argv.includes("--cleanup")) {
    const allowedForms = ["ff5cbb4c-98db-40bb-8359-2dbb50bd0677", "cc41407a-6321-4a7f-a409-a23ce1140336", "af6ecce6-395c-4e00-b832-f68556c23d02", "c0f2fc88-b060-47a5-a01b-ec8c2a2278b3", "2d79603e-16ca-45a2-8b8b-b097e857a13a", "0e6ae045-7d16-4d72-b5b1-35db3d510aa4"];
    const allowedLeads = ["7fb3650b-c2fc-486c-a924-bc2e676eed6a", "41982017-1b28-475e-859f-a42504bce5da", "692e6c3f-a65e-4195-b037-70cf201cc74a", "99a0a3e1-2b3b-4fae-9bc7-2df3f047be2e"];
    if (forms.some((form) => !allowedForms.includes(form.id)) || leads.some((lead) => !allowedLeads.includes(lead.id))) throw new Error("Unexpected fixture IDs; refusing cleanup.");
    const formIds = forms.map((form) => form.id);
    const leadIds = leads.map((lead) => lead.id);
    await prisma.$transaction(async (tx) => {
      const submissions = await tx.marketing_form_submissions.findMany({ where: { marketing_form_id: { in: formIds } }, select: { id: true } });
      await tx.audit_logs.deleteMany({ where: { entity_type: "marketing_form_submission", entity_id: { in: submissions.map((submission) => submission.id) } } });
      await tx.marketing_forms.deleteMany({ where: { id: { in: formIds }, name: { contains: marker } } });
      await tx.audit_logs.deleteMany({ where: { entity_type: "marketing_form", entity_id: { in: formIds } } });
      await tx.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: { in: leadIds } } });
      await tx.leads.deleteMany({ where: { id: { in: leadIds }, full_name: { contains: marker } } });
    });
    console.log("Removed only the verified 6 forms / 4 Lead fixture records and related data.");
  }
}
run().finally(() => prisma.$disconnect());
