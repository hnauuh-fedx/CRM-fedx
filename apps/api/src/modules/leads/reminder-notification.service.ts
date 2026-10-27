import { prisma } from "../../database/prisma";
import { defaultSystemPreferences, readPreference } from "@admission-crm/shared/system-preferences";
import type { Prisma } from "../../generated/prisma/client";
import { getAuthUser } from "../auth/auth.service";
import { getLeadScopeWhere } from "./lead-list.service";

const PROCESS_BATCH_SIZE = 100;
export const REMINDER_OVERDUE_DELAY_MS = 24 * 60 * 60 * 1000;

type ReminderPolicy = { scope: Prisma.leadsWhereInput; due: boolean; overdue: boolean; overdueHours: number };
async function notifyDueReminders(now: Date, reminderIds: string[] | undefined, policy: ReminderPolicy) {
  const reminders = await prisma.reminders.findMany({
    where: {
      ...(reminderIds ? { id: { in: reminderIds } } : {}),
      status: "pending",
      user_id: { not: null },
      due_notified_at: null,
      remind_at: { lte: now },
      leads: { is: { deleted_at: null, ...policy.scope } },
    },
    select: { id: true, lead_id: true, user_id: true, title: true, remind_at: true, leads: { select: { full_name: true, institution_program_id: true } } },
    orderBy: [{ remind_at: "asc" }, { id: "asc" }],
    take: PROCESS_BATCH_SIZE,
  });

  let sent = 0;
  for (const reminder of reminders) {
    const programId = reminder.leads?.institution_program_id ?? undefined;
    const recipient = reminder.user_id && policy.due ? await getAuthUser(reminder.user_id, programId) : null;
    const wasSent = await prisma.$transaction(async (tx) => {
      const claimed = await tx.reminders.updateMany({
        where: { id: reminder.id, status: "pending", due_notified_at: null, remind_at: reminder.remind_at, user_id: reminder.user_id },
        data: { due_notified_at: now },
      });
      if (claimed.count === 0 || !reminder.user_id) {
        return false;
      }
      if (!policy.due) return false;
      if (!recipient || (programId && !recipient.institutionProgramIds.includes(programId)) || !await tx.leads.count({ where: { id: reminder.lead_id!, deleted_at: null, ...getLeadScopeWhere(recipient, programId), ...(programId ? { institution_program_id: programId } : {}) } })) return false;
      await tx.notifications.create({
        data: {
          user_id: reminder.user_id,
          title: "Nhắc việc đã đến hạn",
          content: `Nhắc việc "${reminder.title}" của lead ${reminder.leads?.full_name ?? "chưa xác định"} đã đến hạn xử lý.`,
          type: "reminder_due",
        },
      });
      if (reminder.lead_id) {
        await tx.lead_activities.create({
          data: {
            lead_id: reminder.lead_id,
            type: "reminder_due",
            content: `Nhắc việc đã đến hạn: ${reminder.title}.`,
          },
        });
      }
      return true;
    });
    sent += wasSent ? 1 : 0;
  }
  return sent;
}

async function notifyOverdueReminders(now: Date, reminderIds: string[] | undefined, policy: ReminderPolicy) {
  const overdueAt = new Date(now.getTime() - policy.overdueHours * 60 * 60_000);
  const reminders = await prisma.reminders.findMany({
    where: {
      ...(reminderIds ? { id: { in: reminderIds } } : {}),
      status: "pending",
      user_id: { not: null },
      overdue_notified_at: null,
      remind_at: { lte: overdueAt },
      leads: { is: { deleted_at: null, ...policy.scope } },
    },
    select: { id: true, lead_id: true, user_id: true, title: true, remind_at: true, leads: { select: { full_name: true, institution_program_id: true } } },
    orderBy: [{ remind_at: "asc" }, { id: "asc" }],
    take: PROCESS_BATCH_SIZE,
  });

  let sent = 0;
  for (const reminder of reminders) {
    const programId = reminder.leads?.institution_program_id ?? undefined;
    const recipient = reminder.user_id && policy.overdue ? await getAuthUser(reminder.user_id, programId) : null;
    const wasSent = await prisma.$transaction(async (tx) => {
      const claimed = await tx.reminders.updateMany({
        where: { id: reminder.id, status: "pending", overdue_notified_at: null, remind_at: reminder.remind_at, user_id: reminder.user_id },
        data: { overdue_notified_at: now },
      });
      if (claimed.count === 0 || !reminder.user_id) {
        return false;
      }
      if (!policy.overdue) return false;
      if (!recipient || (programId && !recipient.institutionProgramIds.includes(programId)) || !await tx.leads.count({ where: { id: reminder.lead_id!, deleted_at: null, ...getLeadScopeWhere(recipient, programId), ...(programId ? { institution_program_id: programId } : {}) } })) return false;
      await tx.notifications.create({
        data: {
          user_id: reminder.user_id,
          title: "Nhắc việc đã quá hạn",
          content: `Nhắc việc "${reminder.title}" của lead ${reminder.leads?.full_name ?? "chưa xác định"} vẫn chưa hoàn tất sau ${policy.overdueHours} giờ.`,
          type: "reminder_overdue",
        },
      });
      if (reminder.lead_id) {
        await tx.lead_activities.create({
          data: {
            lead_id: reminder.lead_id,
            type: "reminder_overdue",
            content: `Nhắc việc đã quá hạn: ${reminder.title}.`,
          },
        });
      }
      return true;
    });
    sent += wasSent ? 1 : 0;
  }
  return sent;
}

export async function processReminderNotifications(now = new Date(), reminderIds?: string[]) {
  const saved = await prisma.system_settings.findMany({ where: { key: { startsWith: "crm.preferences." }, OR: [{ key: { endsWith: ".notifications" } }, { key: { endsWith: ".reminders" } }] }, select: { key: true, value: true } });
  const programIds = [...new Set(saved.map(row => row.key.split(".")[2]))];
  const policies: ReminderPolicy[] = [{ scope: programIds.length ? { OR: [{ institution_program_id: null }, { institution_program_id: { notIn: programIds } }] } : {}, due: true, overdue: true, overdueHours: defaultSystemPreferences.reminders.overdueHours }];
  for (const programId of programIds) {
    const notifications = readPreference("notifications", saved.find(row => row.key === `crm.preferences.${programId}.notifications`)?.value);
    const reminders = readPreference("reminders", saved.find(row => row.key === `crm.preferences.${programId}.reminders`)?.value);
    policies.push({ scope: { institution_program_id: programId }, due: notifications.reminderDue, overdue: notifications.reminderOverdue, overdueHours: reminders.overdueHours });
  }
  let due = 0, overdue = 0;
  for (const policy of policies) {
    due += await notifyDueReminders(now, reminderIds, policy);
    overdue += await notifyOverdueReminders(now, reminderIds, policy);
  }
  return { due, overdue };
}
