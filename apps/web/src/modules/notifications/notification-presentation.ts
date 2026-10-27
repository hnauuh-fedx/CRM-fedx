export type NotificationTone = "assignment" | "warning" | "removed" | "other";

const toneByType: Record<string, NotificationTone> = {
  lead_assignment: "assignment",
  automation_reassignment_warning: "warning",
  automation_reassignment_second_warning: "warning",
  automation_reassignment_removed: "removed",
};

export const notificationToneStyles: Record<NotificationTone, { dotClassName: string; label: string }> = {
  assignment: { dotClassName: "bg-emerald-500", label: "Phân công lead" },
  warning: { dotClassName: "bg-orange-500", label: "Cảnh báo sắp chuyển lead" },
  removed: { dotClassName: "bg-zinc-400", label: "Lead đã được chuyển đi" },
  other: { dotClassName: "bg-sky-500", label: "Thông báo khác" },
};

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
