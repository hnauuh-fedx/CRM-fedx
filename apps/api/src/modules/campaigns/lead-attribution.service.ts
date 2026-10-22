import { prisma } from "../../database/prisma";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const emptyToNull = (value?: string) => value?.trim() || null;

export async function patchLeadAttribution(tx: TransactionClient, leadId: string, values: Record<string, unknown>) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  if (Object.hasOwn(values, "gclid")) {
    const tracking = await tx.utm_trackings.findFirst({ where: { lead_id: leadId }, orderBy: [{ created_at: "asc" }, { id: "asc" }] });
    const before = tracking?.gclid ?? null;
    const after = values.gclid as string | null;
    if (before !== after) {
      changes.gclid = { before, after };
      if (tracking) await tx.utm_trackings.update({ where: { id: tracking.id }, data: { gclid: after } });
      else if (after !== null) await tx.utm_trackings.create({ data: { lead_id: leadId, gclid: after } });
    }
  }
  if (Object.hasOwn(values, "tags")) {
    const relations = await tx.entity_tags.findMany({ where: { entity_type: "lead", entity_id: leadId }, include: { tags: true } });
    const before = [...new Set(relations.flatMap((row) => row.tags ? [row.tags.name] : []))].sort();
    const after = (values.tags === null ? [] : values.tags) as string[];
    if (JSON.stringify(before.map((tag) => tag.toLocaleLowerCase()).sort()) !== JSON.stringify(after.map((tag) => tag.toLocaleLowerCase()).sort())) {
      changes.tags = { before, after };
      await tx.entity_tags.deleteMany({ where: { entity_type: "lead", entity_id: leadId } });
      for (const name of after) {
        const tag = await tx.tags.findFirst({ where: { name: { equals: name, mode: "insensitive" } } }) ?? await tx.tags.create({ data: { name } });
        await tx.entity_tags.create({ data: { tag_id: tag.id, entity_type: "lead", entity_id: leadId } });
      }
    }
  }
  return changes;
}

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
