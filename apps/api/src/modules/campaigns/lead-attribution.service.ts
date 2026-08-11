import { prisma } from "../../database/prisma";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const emptyToNull = (value?: string) => value?.trim() || null;

export async function saveLeadAttributionAndTags(
  tx: TransactionClient,
  leadId: string,
  input: { gclid?: string; tags?: string },
) {
  const tracking = await tx.utm_trackings.findFirst({ where: { lead_id: leadId }, select: { id: true } });
  if (input.gclid || tracking) {
    if (tracking) {
      await tx.utm_trackings.update({ where: { id: tracking.id }, data: { gclid: emptyToNull(input.gclid) } });
    } else {
      await tx.utm_trackings.create({ data: { lead_id: leadId, gclid: input.gclid!.trim() } });
    }
  }

  if (input.tags !== undefined) {
    await tx.entity_tags.deleteMany({ where: { entity_type: "lead", entity_id: leadId } });
    const tagNames = Array.from(new Set(input.tags.split(",").map((tag) => tag.trim()).filter(Boolean))).slice(0, 20);
    for (const tagName of tagNames) {
      const tag = await tx.tags.findFirst({ where: { name: { equals: tagName, mode: "insensitive" } }, select: { id: true } })
        ?? await tx.tags.create({ data: { name: tagName }, select: { id: true } });
      await tx.entity_tags.create({ data: { tag_id: tag.id, entity_type: "lead", entity_id: leadId } });
    }
  }
}
