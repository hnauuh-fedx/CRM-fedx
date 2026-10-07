import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "./lead-list.service";
import { getPipelineStageMarker } from "./domain/lead-lifecycle-status";
import { parseTransitionNoteTemplates, type TransitionNoteTemplate } from "./transition-note.schema";

const settingPrefix = "lead_transition_notes.";
export function transitionNoteSettingKey(target: string) {
  return `${settingPrefix}${target}`;
}

// Pipeline definitions and system field settings are global in the current schema.
export async function getTransitionNoteConfiguration() {
  const [stages, settings] = await Promise.all([
    prisma.pipeline_stages.findMany({
      select: { id: true, name: true, pipelines: { select: { name: true } } },
      orderBy: [{ position: "asc" }, { name: "asc" }, { id: "asc" }],
    }),
    prisma.system_settings.findMany({
      where: { key: { startsWith: settingPrefix } },
      select: { key: true, value: true },
    }),
  ]);
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  return [
    ...stages.map((stage) => ({
      target: stage.id,
      label: stage.name,
      pipelineName: stage.pipelines?.name ?? null,
      templates: parseTransitionNoteTemplates(byKey.get(transitionNoteSettingKey(stage.id))),
    })),
    { target: "FAIL", label: "Fail", pipelineName: null, templates: parseTransitionNoteTemplates(byKey.get(transitionNoteSettingKey("FAIL"))) },
  ];
}

export async function setTransitionNoteTemplates(actor: AuthUser, target: string, templates: TransitionNoteTemplate[], ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    if (target !== "FAIL" && !await tx.pipeline_stages.findUnique({ where: { id: target }, select: { id: true } })) {
      return { ok: false as const, reason: "stage_not_found" as const };
    }
    const key = transitionNoteSettingKey(target);
    const previous = await tx.system_settings.findUnique({ where: { key }, select: { value: true } });
    await tx.system_settings.upsert({
      where: { key },
      create: { key, value: JSON.stringify(templates), type: "json" },
      update: { value: JSON.stringify(templates), type: "json" },
    });
    await tx.audit_logs.create({ data: {
      user_id: actor.id, entity_type: "lead_transition_note_configuration", action: "update", ip_address: ipAddress,
      old_data: { target, templates: parseTransitionNoteTemplates(previous?.value) },
      new_data: { target, templates },
    } });
    return { ok: true as const, data: templates };
  });
}

export async function getVisibleTransitionNoteOptions(actor: AuthUser, leadId: string, target: string, institutionProgramId?: string) {
  const lead = await prisma.leads.findFirst({
    where: { id: leadId, deleted_at: null, ...getLeadScopeWhere(actor, institutionProgramId), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) },
    select: { id: true },
  });
  if (!lead) return { ok: false as const, reason: "lead_not_found" as const };
  const stage = target === "FAIL" ? null : await prisma.pipeline_stages.findUnique({ where: { id: target }, select: { name: true } });
  if (target !== "FAIL" && !stage) return { ok: false as const, reason: "stage_not_found" as const };
  const setting = await prisma.system_settings.findUnique({ where: { key: transitionNoteSettingKey(target) }, select: { value: true } });
  return { ok: true as const, data: {
    target,
    label: target === "FAIL" ? "Fail" : getPipelineStageMarker(stage!.name) ?? stage!.name,
    templates: parseTransitionNoteTemplates(setting?.value).filter((template) => template.isActive).map(({ id, content }) => ({ id, content })),
  } };
}

export function formatLeadNote(label: string, content: string) {
  return `${getPipelineStageMarker(label) ?? label} | ${content.trim()}`;
}

export async function resolveTransitionNote(tx: Prisma.TransactionClient, target: string, label: string, templateId?: string, noteContent?: string) {
  if (noteContent !== undefined && (!templateId || !noteContent.trim() || noteContent.trim().length > 1800)) return { ok: false as const, reason: "note_template_invalid" as const };
  if (!templateId) return { ok: true as const, content: undefined };
  const setting = await tx.system_settings.findUnique({ where: { key: transitionNoteSettingKey(target) }, select: { value: true } });
  const template = parseTransitionNoteTemplates(setting?.value).find((item) => item.id === templateId && item.isActive);
  if (!template) return { ok: false as const, reason: "note_template_invalid" as const };
  return { ok: true as const, content: formatLeadNote(label, noteContent ?? template.content) };
}

export async function recordTransitionNote(tx: Prisma.TransactionClient, actor: AuthUser, leadId: string, content: string | undefined, templateId?: string, ipAddress?: string) {
  if (!content) return;
  const note = await tx.lead_notes.create({ data: { lead_id: leadId, user_id: actor.id, content }, select: { id: true } });
  await tx.leads.update({ where: { id: leadId }, data: { note: content } });
  await tx.lead_activities.create({ data: { lead_id: leadId, user_id: actor.id, type: "note_created", content } });
  await tx.audit_logs.create({ data: {
    user_id: actor.id, entity_type: "lead", entity_id: leadId, action: "note_created", ip_address: ipAddress,
    new_data: { noteId: note.id, templateId, content },
  } });
}
