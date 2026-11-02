import { Bell, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getNotificationTone, notificationToneStyles } from "../notification-presentation";
import type { NotificationItem } from "../notification.types";

const toastDurationMs = 5_000;
const maxSeparateToasts = 3;

/** Hides itself after a few seconds; hovering or focusing the popup pauses the countdown. */
function useAutoDismiss(onDismiss: () => void) {
  const [isPaused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; });
  useEffect(() => {
    if (isPaused) return;
    const timer = window.setTimeout(() => onDismissRef.current(), toastDurationMs);
    return () => window.clearTimeout(timer);
  }, [isPaused]);
  return {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus: () => setPaused(true),
    onBlur: () => setPaused(false),
  };
}

function ToastCard({ toneClassName, title, label, onOpen, onDismiss }: {
  toneClassName: string;
  title: string;
  label: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const pauseHandlers = useAutoDismiss(onDismiss);
  return (
    <div
      {...pauseHandlers}
      className={`pointer-events-auto flex items-start gap-2 rounded-lg border p-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 ${toneClassName}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Bell aria-hidden="true" className="mt-0.5 size-4 shrink-0 opacity-70" />
        <span className="min-w-0 break-words">
          <span className="sr-only">{label}: </span>
          {title}
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Đóng thông báo"
        className="-m-1 shrink-0 rounded-md p-1 opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/** Popups under the bell for notifications that arrived while the page is open, newest first. */
export function NewNotificationToasts({ toasts, onOpen, onOpenList, onDismiss, onDismissAll }: {
  toasts: NotificationItem[];
  onOpen: (item: NotificationItem) => void;
  onOpenList: () => void;
  onDismiss: (notificationId: string) => void;
  onDismissAll: () => void;
}) {
  const summarized = toasts.length > maxSeparateToasts;
  const other = notificationToneStyles.other;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-3 z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-16 sm:w-80"
    >
      {summarized ? (
        <ToastCard
          // A new arrival restarts the countdown of the summary.
          key={`summary-${toasts.length}`}
          toneClassName={other.toastClassName}
          title={`Bạn có ${toasts.length} thông báo mới`}
          label="Thông báo mới"
          onOpen={onOpenList}
          onDismiss={onDismissAll}
        />
      ) : toasts.map((item) => {
        const tone = notificationToneStyles[getNotificationTone(item.type)];
        return (
          <ToastCard
            key={item.id}
            toneClassName={tone.toastClassName}
            title={item.title}
            label={tone.label}
            onOpen={() => onOpen(item)}
            onDismiss={() => onDismiss(item.id)}
          />
        );
      })}
    </div>
  );
}
