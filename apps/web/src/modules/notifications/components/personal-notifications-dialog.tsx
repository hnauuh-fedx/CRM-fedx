import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AccessDeniedDialog } from "@/components/shared/access-denied-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { leadListOpenHref } from "@/modules/leads/lead-detail-navigation";
import { ApiError } from "@/services/api";
import { getLead } from "@/services/lead.service";
import { getPersonalNotifications, hideNotificationCountdown, markNotificationRead } from "@/services/notification.service";
import type { NotificationItem, PersonalNotificationResponse } from "../notification.types";
import { NotificationRow } from "./notification-row";

// "Lead đã được chuyển cho nhân viên khác" (automation_reassignment_removed) is intentionally not linked.
const leadLinkedNotificationTypes = new Set(["lead_assignment", "automation_reassignment_warning", "automation_reassignment_second_warning"]);

function getLinkedLeadId(item: NotificationItem) {
  return item.leadId && item.type && leadLinkedNotificationTypes.has(item.type) ? item.leadId : null;
}

// Lead detail is scope-filtered: out of scope (e.g. reassigned) or deleted returns 404, missing permission 403.
function isLeadAccessDenied(error: unknown) {
  return error instanceof ApiError && [403, 404].includes(error.status);
}

/** Checks access before leaving the current page, then opens the lead popup on the lead list. */
function useOpenNotificationLead(accessToken: string, onOpened: () => void) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isAccessDenied, setAccessDenied] = useState(false);
  const openLead = useMutation({
    mutationFn: ({ leadId }: { notificationId: string; leadId: string }) => queryClient.fetchQuery({
      queryKey: ["leads", "detail", leadId],
      queryFn: () => getLead(leadId, accessToken),
      staleTime: 0,
    }),
    onSuccess: (_data, { leadId }) => {
      onOpened();
      navigate(leadListOpenHref(leadId));
    },
    onError: (error, { notificationId }) => {
      if (!isLeadAccessDenied(error)) return;
      setAccessDenied(true);
      // The lead is no longer the user's: its countdown must not come back.
      void hideNotificationCountdown(notificationId, accessToken)
        .then(() => queryClient.invalidateQueries({ queryKey: ["notifications", "personal"] }))
        .catch(() => undefined);
    },
  });
  const otherError = openLead.isError && !isLeadAccessDenied(openLead.error) ? openLead.error : null;
  return {
    open: (notificationId: string, leadId: string) => { if (!openLead.isPending) openLead.mutate({ notificationId, leadId }); },
    reset: openLead.reset,
    openingLeadId: openLead.isPending ? openLead.variables?.leadId ?? null : null,
    errorMessage: otherError ? otherError.message || "Không thể mở lead. Vui lòng thử lại." : null,
    isAccessDenied,
    setAccessDenied,
  };
}

export function PersonalNotificationsDialog({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["notifications", "personal"],
    queryFn: () => getPersonalNotifications(accessToken),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", "personal"] }),
  });
  const leadOpener = useOpenNotificationLead(accessToken, () => setOpen(false));
  const unreadCount = query.data?.unreadCount ?? 0;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { setOpen(open); if (!open) leadOpener.reset(); }}>
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
          {leadOpener.errorMessage && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{leadOpener.errorMessage}</p>}
          <div className="max-h-[min(32rem,calc(100dvh-12rem))] space-y-2 overflow-y-auto pr-1">
            <NotificationsBody
              query={query}
              isReadPending={markRead.isPending}
              openingLeadId={leadOpener.openingLeadId}
              onRead={(notificationId) => markRead.mutate(notificationId)}
              onOpenLead={leadOpener.open}
            />
          </div>
        </DialogContent>
      </Dialog>
      <AccessDeniedDialog open={leadOpener.isAccessDenied} onOpenChange={leadOpener.setAccessDenied} />
    </>
  );
}

function NotificationsBody({ query, isReadPending, openingLeadId, onRead, onOpenLead }: {
  query: UseQueryResult<PersonalNotificationResponse>;
  isReadPending: boolean;
  openingLeadId: string | null;
  onRead: (notificationId: string) => void;
  onOpenLead: (notificationId: string, leadId: string) => void;
}) {
  if (query.isLoading) {
    return <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Spinner aria-label="Đang tải thông báo" />Đang tải thông báo&hellip;</p>;
  }
  if (query.isError) {
    return <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Không thể tải thông báo. Vui lòng thử lại.</p>;
  }
  const items = query.data?.data ?? [];
  if (items.length === 0) {
    return <p className="rounded-md bg-muted/55 p-6 text-center text-sm text-muted-foreground">Chưa có thông báo.</p>;
  }
  return items.map((notification) => {
    const leadId = getLinkedLeadId(notification);
    return (
      <NotificationRow
        key={notification.id}
        item={notification}
        isPending={isReadPending}
        onRead={() => onRead(notification.id)}
        isOpening={Boolean(leadId) && openingLeadId === leadId}
        onOpen={leadId ? () => {
          if (!notification.isRead) onRead(notification.id);
          onOpenLead(notification.id, leadId);
        } : undefined}
      />
    );
  });
}
