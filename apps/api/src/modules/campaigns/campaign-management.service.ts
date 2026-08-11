import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

export type CampaignInput = {
  name: string;
  type?: string;
  status: "planning" | "active" | "paused" | "completed";
  startDate?: string;
  endDate?: string;
  budget: number;
  institutionProgramId?: string;
};

type CampaignActor = Pick<AuthUser, "id" | "permissions" | "departmentIds">;

function mutationScope(actor: CampaignActor, action: "update" | "delete") {
  const permissions = new Set(actor.permissions);
  if (permissions.has("campaign.view_all") && permissions.has(`campaign.${action}`)) {
    return {};
  }
  if (permissions.has(`campaign.${action}`)) {
    return {
      users: {
        is: {
          user_departments: { some: { department_id: { in: actor.departmentIds } } },
        },
      },
    };
  }
  return { created_by: actor.id };
}

function toData(input: CampaignInput) {
  return {
    name: input.name.trim(),
    type: input.type?.trim() || null,
    status: input.status,
    start_date: input.startDate ? new Date(input.startDate) : null,
    end_date: input.endDate ? new Date(input.endDate) : null,
    budget: input.budget,
    institution_program_id: input.institutionProgramId ?? null,
  };
}

async function hasValidProgram(institutionProgramId?: string) {
  return !institutionProgramId || Boolean(await prisma.institution_programs.findUnique({
    where: { id: institutionProgramId },
    select: { id: true },
  }));
}

export async function createCampaign(actor: CampaignActor, input: CampaignInput, ipAddress?: string) {
  if (!await hasValidProgram(input.institutionProgramId)) {
    return { ok: false as const, reason: "program_not_found" as const };
  }
  const data = toData(input);
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaigns.create({
      data: { ...data, created_by: actor.id },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "campaign",
        entity_id: campaign.id,
        action: "create",
        ip_address: ipAddress,
        new_data: data,
      },
    });
    return { ok: true as const, data: campaign };
  });
}

export async function updateCampaign(actor: CampaignActor, campaignId: string, input: CampaignInput, ipAddress?: string) {
  if (!await hasValidProgram(input.institutionProgramId)) {
    return { ok: false as const, reason: "program_not_found" as const };
  }
  const scope = mutationScope(actor, "update");
  const data = toData(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.campaigns.findFirst({
      where: { id: campaignId, ...scope },
      select: {
        name: true,
        type: true,
        status: true,
        start_date: true,
        end_date: true,
        budget: true,
        institution_program_id: true,
      },
    });
    if (!existing) {
      return { ok: false as const, reason: "campaign_not_found" as const };
    }
    await tx.campaigns.update({ where: { id: campaignId }, data });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "campaign",
        entity_id: campaignId,
        action: "update",
        ip_address: ipAddress,
        old_data: existing,
        new_data: data,
      },
    });
    return { ok: true as const, data: { id: campaignId } };
  });
}

export async function deleteCampaign(actor: CampaignActor, campaignId: string, ipAddress?: string) {
  const scope = mutationScope(actor, "delete");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.campaigns.findFirst({
      where: { id: campaignId, ...scope },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        budget: true,
        _count: { select: { marketing_forms: true, utm_trackings: true } },
      },
    });
    if (!existing) {
      return { ok: false as const, reason: "campaign_not_found" as const };
    }
    if (existing._count.marketing_forms > 0 || existing._count.utm_trackings > 0) {
      return { ok: false as const, reason: "campaign_in_use" as const };
    }
    await tx.campaigns.delete({ where: { id: campaignId } });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "campaign",
        entity_id: campaignId,
        action: "delete",
        ip_address: ipAddress,
        old_data: existing,
      },
    });
    return { ok: true as const, data: { id: campaignId } };
  });
}
