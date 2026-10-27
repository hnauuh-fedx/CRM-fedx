import { prisma } from "../../database/prisma";
import { getReassignmentWarningStates } from "../automations/automation-reassignment.service";

const reassignmentWarningKinds = {
  automation_reassignment_warning: "first",
  automation_reassignment_second_warning: "second",
} as const;

export async function listPersonalNotifications(userId: string, page: number, limit: number) {
  const [items, total, unreadCount] = await prisma.$transaction([
    prisma.notifications.findMany({
      where: { user_id: userId },
      select: {
        id: true, title: true, content: true, type: true, is_read: true, created_at: true, lead_id: true,
        reassignment_monitor_id: true, action_due_at: true, countdown_hidden_at: true,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notifications.count({ where: { user_id: userId } }),
    prisma.notifications.count({ where: { user_id: userId, is_read: false } }),
  ]);
  const monitorIds = items.flatMap((item) => item.reassignment_monitor_id && !item.countdown_hidden_at ? [item.reassignment_monitor_id] : []);
  const warningStates = await getReassignmentWarningStates([...new Set(monitorIds)]);

  return {
    data: items.map((item) => {
      const warning = item.type ? reassignmentWarningKinds[item.type as keyof typeof reassignmentWarningKinds] : undefined;
      const state = item.reassignment_monitor_id ? warningStates.get(item.reassignment_monitor_id) : undefined;
      // Hidden once the assignee interacted (lead no longer at risk) or learned it was taken away.
      const showCountdown = warning && item.action_due_at && !item.countdown_hidden_at && !state?.interacted;
      // With two warnings the first shows a fixed duration and the second counts down; a single warning counts down.
      const display = warning === "first" && state?.hasSecondWarning ? "duration" : "countdown";
      return {
        id: item.id,
        title: item.title,
        content: item.content,
        type: item.type,
        leadId: item.lead_id,
        isRead: item.is_read ?? false,
        createdAt: item.created_at?.toISOString() ?? null,
        reassignmentCountdown: showCountdown
          ? { warning, display, notifiedDueAt: item.action_due_at!.toISOString(), dueAt: (state?.dueAt ?? item.action_due_at!).toISOString() }
          : null,
      };
    }),
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function markPersonalNotificationRead(userId: string, notificationId: string) {
  const updated = await prisma.notifications.updateMany({
    where: { id: notificationId, user_id: userId },
    data: { is_read: true },
  });
  return updated.count > 0;
}

/** The lead is no longer the user's: stop showing the countdown on every warning about it. */
export async function hidePersonalNotificationCountdown(userId: string, notificationId: string) {
  const notification = await prisma.notifications.findFirst({ where: { id: notificationId, user_id: userId }, select: { lead_id: true } });
  if (!notification) return false;
  await prisma.notifications.updateMany({
    where: {
      user_id: userId,
      countdown_hidden_at: null,
      ...(notification.lead_id ? { lead_id: notification.lead_id, reassignment_monitor_id: { not: null } } : { id: notificationId }),
    },
    data: { countdown_hidden_at: new Date() },
  });
  return true;
}
