export type NotificationTone = "assignment" | "warning" | "removed" | "other";

const toneByType: Record<string, NotificationTone> = {
  lead_assignment: "assignment",
  automation_reassignment_warning: "warning",
  automation_reassignment_second_warning: "warning",
  automation_reassignment_removed: "removed",
};

// toastClassName: a mid-light tint of the dot color for the new-notification popup.
export const notificationToneStyles: Record<NotificationTone, { dotClassName: string; toastClassName: string; label: string }> = {
  assignment: { dotClassName: "bg-emerald-500", toastClassName: "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50", label: "Phân công lead" },
  warning: { dotClassName: "bg-orange-500", toastClassName: "border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-50", label: "Cảnh báo sắp chuyển lead" },
  removed: { dotClassName: "bg-zinc-400", toastClassName: "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50", label: "Lead đã được chuyển đi" },
  other: { dotClassName: "bg-sky-500", toastClassName: "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-50", label: "Thông báo khác" },
};

/**
 * Unread notifications not seen in an earlier response. The first response (seenIds null) only
 * records what is there, so notifications that existed before the page opened never pop up.
 */
export function collectNewNotifications<T extends { id: string; isRead: boolean }>(seenIds: ReadonlySet<string> | null, items: T[]) {
  const seen = new Set(seenIds);
  const fresh = seenIds ? items.filter((item) => !item.isRead && !seenIds.has(item.id)) : [];
  for (const item of items) seen.add(item.id);
  return { seen, fresh };
}

export function getNotificationTone(type: string | null): NotificationTone {
  return (type && toneByType[type]) || "other";
}

/** Live countdown: "10:40" under an hour, "1:05:20" from an hour (hours keep growing past a day). */
export function formatCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Static duration for the first warning, e.g. "25 phút" or "1 giờ 20 phút". */
export function formatDurationText(durationMs: number) {
  const totalMinutes = Math.floor(Math.max(0, durationMs) / 60_000);
  if (totalMinutes < 1) return "dưới 1 phút";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} phút`;
  return minutes === 0 ? `${hours} giờ` : `${hours} giờ ${minutes} phút`;
}
