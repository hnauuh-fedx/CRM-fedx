export type NotificationItem = {
  id: string;
  title: string;
  content: string | null;
  type: string | null;
  /** Lead the notification refers to, when it has one. */
  leadId: string | null;
  isRead: boolean;
  createdAt: string | null;
  /** Reassignment warnings only; null once the lead is no longer at risk or no longer the user's. */
  reassignmentCountdown: {
    warning: "first" | "second";
    /** "duration": fixed time left as of sending (first of two warnings); "countdown": live clock. */
    display: "duration" | "countdown";
    /** Transfer time when the warning was sent; the "duration" display shows the time left from then. */
    notifiedDueAt: string;
    /** Current transfer time; the "countdown" display counts down to it. */
    dueAt: string;
  } | null;
};

export type PersonalNotificationResponse = {
  data: NotificationItem[];
  unreadCount: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
