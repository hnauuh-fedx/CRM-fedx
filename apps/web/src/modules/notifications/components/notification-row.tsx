import { ChevronRight, Timer } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatCountdown, formatDurationText, getNotificationTone, notificationToneStyles } from "../notification-presentation";
import type { NotificationItem } from "../notification.types";

const formatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string | null) {
  return value ? formatter.format(new Date(value)) : "-";
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

type ReassignmentCountdown = NonNullable<NotificationItem["reassignmentCountdown"]>;

/** Fixed time left as of sending (first of two warnings), otherwise a live countdown. */
function ReassignmentTimeLeft({ countdown, createdAt }: { countdown: ReassignmentCountdown; createdAt: string | null }) {
  const isLive = countdown.display === "countdown";
  const now = useNow(isLive ? 1000 : 30_000);
  const remainingMs = new Date(countdown.dueAt).getTime() - now;
  if (remainingMs <= 0) return <span className="font-medium text-primary">· đã hết thời gian</span>;
  if (!isLive) {
    const sentAt = createdAt ? new Date(createdAt).getTime() : now;
    return <span className="font-medium text-primary">· chuyển sau {formatDurationText(new Date(countdown.notifiedDueAt).getTime() - sentAt)}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 font-medium text-primary tabular-nums">
      · <Timer aria-hidden="true" className="size-3" />
      <span aria-label={`Còn ${formatCountdown(remainingMs)} trước khi chuyển`}>{formatCountdown(remainingMs)}</span>
    </span>
  );
}

type NotificationRowProps = {
  item: NotificationItem;
  isPending: boolean;
  onRead: () => void;
  /** Present only for notifications that link to a record; makes the row open it. */
  onOpen?: () => void;
  isOpening?: boolean;
};

export function NotificationRow({ item, isPending, onRead, onOpen, isOpening = false }: NotificationRowProps) {
  const tone = notificationToneStyles[getNotificationTone(item.type)];
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{item.title}</h3>
        {!item.isRead && <Badge variant="secondary">Mới</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{item.content ?? "-"}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {formatDateTime(item.createdAt)}
        {onOpen && (
          <span className="ml-2 inline-flex items-center gap-1 font-medium text-primary">
            {isOpening ? <Spinner aria-hidden="true" className="size-3" /> : <ChevronRight aria-hidden="true" className="size-3" />}
            {isOpening ? "Đang mở lead…" : "Mở lead"}
          </span>
        )}
        {item.reassignmentCountdown && <ReassignmentTimeLeft countdown={item.reassignmentCountdown} createdAt={item.createdAt} />}
      </p>
    </>
  );

  return (
    <article className={`rounded-lg border p-4 transition-colors ${item.isRead ? "bg-background" : "border-primary/20 bg-primary/5"} ${onOpen ? "hover:border-primary/40 hover:bg-primary/10" : ""}`}>
      <div className="flex items-stretch justify-between gap-3">
        {onOpen ? (
          <button
            type="button"
            className="-m-1 min-w-0 flex-1 rounded-md p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait"
            disabled={isOpening}
            aria-busy={isOpening}
            onClick={onOpen}
          >
            {body}
          </button>
        ) : (
          <div className="min-w-0">{body}</div>
        )}
        <div className="flex shrink-0 flex-col items-end justify-between gap-3">
          {!item.isRead ? (
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onRead}>
              Đã đọc
            </Button>
          ) : <span />}
          <span title={tone.label} className="flex items-center">
            <span aria-hidden="true" className={`size-2.5 rounded-full ${tone.dotClassName}`} />
            <span className="sr-only">Loại thông báo: {tone.label}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
