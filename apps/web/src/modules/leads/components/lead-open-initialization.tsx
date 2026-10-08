import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/modules/auth/auth-context";
import { initializeLeadOnOpen } from "@/services/lead.service";
import type { LeadDetail } from "../lead.types";

export function LeadOpenInitialization({ lead, isOpen = true }: { lead: LeadDetail; isOpen?: boolean }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const attempted = useRef(false);
  const eligible = isOpen && lead.assignee?.id === auth.user?.id
    && lead.lifecycleStatus.value === "ACTIVE";
  const { mutate, isPending, error, data } = useMutation({
    mutationFn: () => initializeLeadOnOpen(lead.id, auth.accessToken!),
    onSuccess: (result) => {
      // Announce the committed change immediately; unrelated report refreshes must not hold the notice pending.
      if (result.changed) for (const key of ["leads", "sale", "dashboard", "reports"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  useEffect(() => {
    if (!eligible || attempted.current) return;
    let cancelled = false;
    // Start after the effect is committed, including StrictMode's setup/cleanup replay.
    queueMicrotask(() => {
      if (cancelled || attempted.current) return;
      attempted.current = true;
      mutate();
    });
    return () => { cancelled = true; };
  }, [eligible, mutate]);

  if (isPending) return <p role="status" className="text-sm text-muted-foreground">Đang ghi nhận lần mở Lead…</p>;
  if (error) return <Alert variant="destructive">
    <AlertTitle>Chưa thể ghi nhận lần mở Lead</AlertTitle>
    <AlertDescription>{error.message}{eligible && <Button type="button" variant="outline" onClick={() => mutate()}>Thử lại</Button>}</AlertDescription>
  </Alert>;
  if (data?.pipelineInitializationIssue === "initial_stage_unavailable") return <Alert variant="destructive">
    <AlertTitle>Đã ghi nhận lần mở, nhưng chưa thể chuyển tiến trình</AlertTitle>
    <AlertDescription>Cần cấu hình duy nhất một tiến trình L0 cho CRM Sale.</AlertDescription>
  </Alert>;
  if (!data?.changed) return null;
  return <Alert role="status">
    <CheckCircle2 aria-hidden="true" />
    <AlertTitle className="line-clamp-none">Đã tự động chuyển lead sang tiến trình L0</AlertTitle>
    <AlertDescription>Lead chưa có tiến trình đã được chuyển sang L0 khi bạn mở bản ghi.</AlertDescription>
  </Alert>;
}
