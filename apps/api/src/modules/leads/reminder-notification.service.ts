import { prisma } from "../../database/prisma";

const PROCESS_BATCH_SIZE = 100;
export const REMINDER_OVERDUE_DELAY_MS = 24 * 60 * 60 * 1000;

async function notifyDueReminders(now: Date, reminderIds?: string[]) {
  const reminders = await prisma.reminders.findMany({
    where: {
      ...(reminderIds ? { id: { in: reminderIds } } : {}),
      status: "pending",
      user_id: { not: null },
      due_notified_at: null,
      remind_at: { lte: now },
      leads: { is: { deleted_at: null } },
    },
    select: { id: true, lead_id: true, user_id: true, title: true, leads: { select: { full_name: true } } },
    orderBy: [{ remind_at: "asc" }, { id: "asc" }],
    take: PROCESS_BATCH_SIZE,
  });

  let sent = 0;
  for (const reminder of reminders) {
    const wasSent = await prisma.$transaction(async (tx) => {
      const claimed = await tx.reminders.updateMany({
        where: { id: reminder.id, status: "pending", due_notified_at: null },
        data: { due_notified_at: now },
      });
      if (claimed.count === 0 || !reminder.user_id) {
        return false;
      }
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

async function notifyOverdueReminders(now: Date, reminderIds?: string[]) {
  const overdueAt = new Date(now.getTime() - REMINDER_OVERDUE_DELAY_MS);
  const reminders = await prisma.reminders.findMany({
    where: {
      ...(reminderIds ? { id: { in: reminderIds } } : {}),
      status: "pending",
      user_id: { not: null },
      overdue_notified_at: null,
      remind_at: { lte: overdueAt },
      leads: { is: { deleted_at: null } },
    },
    select: { id: true, lead_id: true, user_id: true, title: true, leads: { select: { full_name: true } } },
    orderBy: [{ remind_at: "asc" }, { id: "asc" }],
    take: PROCESS_BATCH_SIZE,
  });

  let sent = 0;
  for (const reminder of reminders) {
    const wasSent = await prisma.$transaction(async (tx) => {
      const claimed = await tx.reminders.updateMany({
        where: { id: reminder.id, status: "pending", overdue_notified_at: null },
        data: { overdue_notified_at: now },
      });
      if (claimed.count === 0 || !reminder.user_id) {
        return false;
      }
      await tx.notifications.create({
        data: {
          user_id: reminder.user_id,
          title: "Nhắc việc đã quá hạn",
          content: `Nhắc việc "${reminder.title}" của lead ${reminder.leads?.full_name ?? "chưa xác định"} vẫn chưa hoàn tất sau 24 giờ.`,
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
  const [due, overdue] = await Promise.all([notifyDueReminders(now, reminderIds), notifyOverdueReminders(now, reminderIds)]);
  return { due, overdue };
}
