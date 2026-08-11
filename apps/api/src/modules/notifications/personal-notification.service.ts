import { prisma } from "../../database/prisma";

export async function listPersonalNotifications(userId: string, page: number, limit: number) {
  const [items, total, unreadCount] = await prisma.$transaction([
    prisma.notifications.findMany({
      where: { user_id: userId },
      select: { id: true, title: true, content: true, type: true, is_read: true, created_at: true },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notifications.count({ where: { user_id: userId } }),
    prisma.notifications.count({ where: { user_id: userId, is_read: false } }),
  ]);

  return {
    data: items.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      type: item.type,
      isRead: item.is_read ?? false,
      createdAt: item.created_at?.toISOString() ?? null,
    })),
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
