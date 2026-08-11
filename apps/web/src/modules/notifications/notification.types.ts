export type NotificationItem = {
  id: string;
  title: string;
  content: string | null;
  type: string | null;
  isRead: boolean;
  createdAt: string | null;
};

export type PersonalNotificationResponse = {
  data: NotificationItem[];
  unreadCount: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
