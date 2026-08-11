import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function NotificationRow({ item, isPending, onRead }: { item: NotificationItem; isPending: boolean; onRead: () => void }) {
  return (
    <article className={`rounded-lg border p-4 ${item.isRead ? "bg-background" : "border-primary/20 bg-primary/5"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{item.title}</h3>
            {!item.isRead && <Badge variant="secondary">Mới</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{item.content ?? "-"}</p>
          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
        </div>
        {!item.isRead && (
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onRead}>
            Đã đọc
          </Button>
        )}
      </div>
    </article>
  );
}
