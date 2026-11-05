import { prisma } from "../../database/prisma";
import { preferenceRevision } from "../system/system-preferences.service";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "./lead-list.service";
import { getPipelineStageMarker } from "./domain/lead-lifecycle-status";
import {
  STAGE_DETAIL_FAIL_TARGET,
  parseStageDetailOptions,
  resolveStageDetailContent,
  type StageDetailOption,
  type StageDetailSelection,
} from "./stage-detail-option.schema";

const settingPrefix = "lead_stage_detail_options.";
export function stageDetailSettingKey(target: string) {
  return `${settingPrefix}${target}`;
}

// Pipeline definitions and system field settings are global in the current schema.
export async function getStageDetailConfiguration() {
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
  const toEntry = (target: string, label: string, pipelineName: string | null) => {
    const value = byKey.get(stageDetailSettingKey(target));
    return { target, label, pipelineName, options: parseStageDetailOptions(value), revision: preferenceRevision(value) };
  };
  return [
    ...stages.map((stage) => toEntry(stage.id, stage.name, stage.pipelines?.name ?? null)),
    toEntry(STAGE_DETAIL_FAIL_TARGET, "Fail", null),
  ];
}

export async function setStageDetailOptions(actor: AuthUser, target: string, options: StageDetailOption[], ipAddress?: string, revision?: string) {
  return prisma.$transaction(async (tx) => {
    if (target !== STAGE_DETAIL_FAIL_TARGET && !await tx.pipeline_stages.findUnique({ where: { id: target }, select: { id: true } })) {
      return { ok: false as const, reason: "stage_not_found" as const };
    }
    const key = stageDetailSettingKey(target);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)) IS NULL AS locked`;
    const previous = await tx.system_settings.findUnique({ where: { key }, select: { value: true } });
    if (revision && revision !== preferenceRevision(previous?.value)) return { ok: false as const, reason: "conflict" as const };
    const value = JSON.stringify(options);
    await tx.system_settings.upsert({ where: { key }, create: { key, value, type: "json" }, update: { value, type: "json" } });
    await tx.audit_logs.create({ data: {
      user_id: actor.id, entity_type: "lead_stage_detail_configuration", action: "update", ip_address: ipAddress,
      old_data: { target, options: parseStageDetailOptions(previous?.value) },
      new_data: { target, options },
    } });
    // The new revision lets the editor save several targets in a row without reloading.
    return { ok: true as const, data: { options, revision: preferenceRevision(value) } };
  });
}

export async function getVisibleStageDetailOptions(actor: AuthUser, leadId: string, target: string, institutionProgramId?: string) {
  const lead = await prisma.leads.findFirst({
    where: { id: leadId, deleted_at: null, ...getLeadScopeWhere(actor, institutionProgramId), ...(institutionProgramId ? { institution_program_id: institutionProgramId } : {}) },
    select: { id: true },
  });
  if (!lead) return { ok: false as const, reason: "lead_not_found" as const };
  const isFail = target === STAGE_DETAIL_FAIL_TARGET;
  const stage = isFail ? null : await prisma.pipeline_stages.findUnique({ where: { id: target }, select: { name: true } });
  if (!isFail && !stage) return { ok: false as const, reason: "stage_not_found" as const };
  const setting = await prisma.system_settings.findUnique({ where: { key: stageDetailSettingKey(target) }, select: { value: true } });
  return { ok: true as const, data: {
    target,
    label: isFail ? "Fail" : getPipelineStageMarker(stage!.name) ?? stage!.name,
    options: parseStageDetailOptions(setting?.value),
  } };
}

/** Validates a selection against the target's current configuration inside the mutation transaction. */
export async function resolveStageDetail(tx: Prisma.TransactionClient, target: string, selection?: StageDetailSelection) {
  if (!selection) return { ok: true as const, content: undefined };
  const setting = await tx.system_settings.findUnique({ where: { key: stageDetailSettingKey(target) }, select: { value: true } });
  const content = resolveStageDetailContent(parseStageDetailOptions(setting?.value), selection);
  return content ? { ok: true as const, content } : { ok: false as const, reason: "stage_detail_invalid" as const };
}
