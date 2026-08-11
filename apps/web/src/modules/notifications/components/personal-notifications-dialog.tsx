import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { getPersonalNotifications, markNotificationRead } from "@/services/notification.service";
import { NotificationRow } from "./notification-row";

export function PersonalNotificationsDialog({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", "personal"],
    queryFn: () => getPersonalNotifications(accessToken),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", "personal"] }),
  });
  const unreadCount = query.data?.unreadCount ?? 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-lg" className="relative" aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ""}`}>
          <Bell aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(42rem,calc(100dvh-2rem))] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Thông báo</DialogTitle>
          <DialogDescription>
            {unreadCount > 0 ? `Bạn có ${unreadCount} thông báo chưa đọc.` : "Bạn không có thông báo chưa đọc."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(32rem,calc(100dvh-12rem))] space-y-2 overflow-y-auto pr-1">
          {query.isLoading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Spinner aria-label="Đang tải thông báo" />Đang tải thông báo&hellip;</p>
          ) : query.isError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Không thể tải thông báo. Vui lòng thử lại.</p>
          ) : query.data?.data.length === 0 ? (
            <p className="rounded-md bg-muted/55 p-6 text-center text-sm text-muted-foreground">Chưa có thông báo.</p>
          ) : (
            query.data?.data.map((notification) => (
              <NotificationRow key={notification.id} item={notification} isPending={markRead.isPending} onRead={() => markRead.mutate(notification.id)} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
