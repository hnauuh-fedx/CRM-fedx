import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";

export type SettingInput = { key: string; value?: string; type?: string };
export type SlaRuleInput = { name: string; module?: string; durationMinutes: number; action?: string; isActive: boolean };
export type ReportConfigInput = { name: string; reportType: string; filters?: unknown; isActive: boolean };

function jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null ? undefined : (value as Prisma.InputJsonValue);
}

function serializeSetting(setting: { id: string; key: string; value: string | null; type: string | null; created_at: Date | null }) {
  return { id: setting.id, key: setting.key, value: setting.value, type: setting.type, createdAt: setting.created_at?.toISOString() ?? null };
}

function serializeSla(rule: { id: string; name: string; module: string | null; duration_minutes: number; action: string | null; is_active: boolean | null; created_at: Date | null }) {
  return {
    id: rule.id,
    name: rule.name,
    module: rule.module,
    durationMinutes: rule.duration_minutes,
    action: rule.action,
    isActive: rule.is_active ?? true,
    createdAt: rule.created_at?.toISOString() ?? null,
  };
}

function serializeReportConfig(config: { id: string; name: string; report_type: string; filters: unknown; is_active: boolean | null; created_at: Date | null; updated_at: Date | null }) {
  return {
    id: config.id,
    name: config.name,
    reportType: config.report_type,
    filters: config.filters,
    isActive: config.is_active ?? true,
    createdAt: config.created_at?.toISOString() ?? null,
    updatedAt: config.updated_at?.toISOString() ?? null,
  };
}

async function getQueueHealth() {
  const [jobGroups, recentJobs, unreadNotifications, failedJobs, pendingJobs] = await prisma.$transaction([
    prisma.automation_jobs.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.automation_jobs.findMany({
      select: { id: true, type: true, status: true, run_at: true, completed_at: true, created_at: true },
      orderBy: [{ created_at: "desc" }],
      take: 10,
    }),
    prisma.notifications.count({ where: { is_read: false } }),
    prisma.automation_jobs.count({ where: { status: "failed" } }),
    prisma.automation_jobs.count({ where: { status: "pending" } }),
  ]);

  return {
    status: failedJobs > 0 ? "warning" : "ok",
    pendingJobs,
    failedJobs,
    unreadNotifications,
    jobStatusCounts: jobGroups.map((group) => ({ status: group.status ?? "unknown", count: group._count._all })),
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status ?? "pending",
      runAt: job.run_at?.toISOString() ?? null,
      completedAt: job.completed_at?.toISOString() ?? null,
      createdAt: job.created_at?.toISOString() ?? null,
    })),
  };
}

export async function getSystemManagementDashboard() {
  const [settings, slaRules, reportConfigs, health] = await Promise.all([
    prisma.system_settings.findMany({ select: { id: true, key: true, value: true, type: true, created_at: true }, orderBy: { key: "asc" } }),
    prisma.sla_rules.findMany({ select: { id: true, name: true, module: true, duration_minutes: true, action: true, is_active: true, created_at: true }, orderBy: [{ module: "asc" }, { name: "asc" }] }),
    prisma.report_configs.findMany({ select: { id: true, name: true, report_type: true, filters: true, is_active: true, created_at: true, updated_at: true }, orderBy: [{ report_type: "asc" }, { name: "asc" }] }),
    getQueueHealth(),
  ]);

  return {
    settings: settings.map(serializeSetting),
    notificationRules: settings.filter((setting) => setting.key.startsWith("notification.")).map(serializeSetting),
    slaRules: slaRules.map(serializeSla),
    exportSettings: reportConfigs.map(serializeReportConfig),
    health,
  };
}

export async function upsertSystemSetting(actor: AuthUser, input: SettingInput, ipAddress?: string) {
  const key = input.key.trim();
  const existing = await prisma.system_settings.findUnique({ where: { key }, select: { id: true, key: true, value: true, type: true } });
  const setting = await prisma.$transaction(async (tx) => {
    const saved = await tx.system_settings.upsert({
      where: { key },
      create: { key, value: input.value?.trim() || null, type: input.type?.trim() || null },
      update: { value: input.value?.trim() || null, type: input.type?.trim() || null },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "system_setting",
        entity_id: saved.id,
        action: existing ? "update" : "create",
        ip_address: ipAddress,
        old_data: existing ?? undefined,
        new_data: { key, value: input.value?.trim() || null, type: input.type?.trim() || null },
      },
    });
    return saved;
  });
  return { ok: true as const, data: setting };
}

export async function deleteSystemSetting(actor: AuthUser, id: string, ipAddress?: string) {
  const existing = await prisma.system_settings.findUnique({ where: { id }, select: { id: true, key: true, value: true, type: true } });
  if (!existing) return { ok: false as const, reason: "setting_not_found" as const };
  await prisma.$transaction([
    prisma.system_settings.delete({ where: { id } }),
    prisma.audit_logs.create({ data: { user_id: actor.id, entity_type: "system_setting", entity_id: id, action: "delete", ip_address: ipAddress, old_data: existing } }),
  ]);
  return { ok: true as const, data: { id } };
}

export async function createSlaRule(actor: AuthUser, input: SlaRuleInput, ipAddress?: string) {
  const rule = await prisma.$transaction(async (tx) => {
    const saved = await tx.sla_rules.create({
      data: { name: input.name.trim(), module: input.module?.trim() || null, duration_minutes: input.durationMinutes, action: input.action?.trim() || null, is_active: input.isActive },
      select: { id: true },
    });
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "sla_rule", entity_id: saved.id, action: "create", ip_address: ipAddress, new_data: input } });
    return saved;
  });
  return { ok: true as const, data: rule };
}

export async function updateSlaRule(actor: AuthUser, id: string, input: SlaRuleInput, ipAddress?: string) {
  const existing = await prisma.sla_rules.findUnique({ where: { id }, select: { id: true, name: true, module: true, duration_minutes: true, action: true, is_active: true } });
  if (!existing) return { ok: false as const, reason: "sla_not_found" as const };
  await prisma.$transaction([
    prisma.sla_rules.update({ where: { id }, data: { name: input.name.trim(), module: input.module?.trim() || null, duration_minutes: input.durationMinutes, action: input.action?.trim() || null, is_active: input.isActive } }),
    prisma.audit_logs.create({ data: { user_id: actor.id, entity_type: "sla_rule", entity_id: id, action: "update", ip_address: ipAddress, old_data: existing, new_data: input } }),
  ]);
  return { ok: true as const, data: { id } };
}

export async function deleteSlaRule(actor: AuthUser, id: string, ipAddress?: string) {
  const existing = await prisma.sla_rules.findUnique({ where: { id }, select: { id: true, name: true, module: true, duration_minutes: true, action: true, is_active: true } });
  if (!existing) return { ok: false as const, reason: "sla_not_found" as const };
  await prisma.$transaction([
    prisma.sla_rules.delete({ where: { id } }),
    prisma.audit_logs.create({ data: { user_id: actor.id, entity_type: "sla_rule", entity_id: id, action: "delete", ip_address: ipAddress, old_data: existing } }),
  ]);
  return { ok: true as const, data: { id } };
}

export async function createReportConfig(actor: AuthUser, input: ReportConfigInput, ipAddress?: string) {
  const config = await prisma.$transaction(async (tx) => {
    const saved = await tx.report_configs.create({
      data: { name: input.name.trim(), report_type: input.reportType.trim(), filters: jsonOrUndefined(input.filters), is_active: input.isActive, updated_at: new Date() },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "report_config",
        entity_id: saved.id,
        action: "create",
        ip_address: ipAddress,
        new_data: { name: input.name.trim(), reportType: input.reportType.trim(), filters: jsonOrUndefined(input.filters), isActive: input.isActive },
      },
    });
    return saved;
  });
  return { ok: true as const, data: config };
}

export async function updateReportConfig(actor: AuthUser, id: string, input: ReportConfigInput, ipAddress?: string) {
  const existing = await prisma.report_configs.findUnique({ where: { id }, select: { id: true, name: true, report_type: true, filters: true, is_active: true } });
  if (!existing) return { ok: false as const, reason: "report_config_not_found" as const };
  await prisma.$transaction([
    prisma.report_configs.update({ where: { id }, data: { name: input.name.trim(), report_type: input.reportType.trim(), filters: jsonOrUndefined(input.filters), is_active: input.isActive, updated_at: new Date() } }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "report_config",
        entity_id: id,
        action: "update",
        ip_address: ipAddress,
        old_data: existing,
        new_data: { name: input.name.trim(), reportType: input.reportType.trim(), filters: jsonOrUndefined(input.filters), isActive: input.isActive },
      },
    }),
  ]);
  return { ok: true as const, data: { id } };
}

export async function deleteReportConfig(actor: AuthUser, id: string, ipAddress?: string) {
  const existing = await prisma.report_configs.findUnique({ where: { id }, select: { id: true, name: true, report_type: true, filters: true, is_active: true } });
  if (!existing) return { ok: false as const, reason: "report_config_not_found" as const };
  await prisma.$transaction([
    prisma.report_configs.delete({ where: { id } }),
    prisma.audit_logs.create({ data: { user_id: actor.id, entity_type: "report_config", entity_id: id, action: "delete", ip_address: ipAddress, old_data: existing } }),
  ]);
  return { ok: true as const, data: { id } };
}
