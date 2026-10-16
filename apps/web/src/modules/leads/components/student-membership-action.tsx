import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/auth-context";
import { changeStudentMembership } from "@/services/lead.service";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { LeadDetail } from "../lead.types";

export function StudentMembershipAction({ lead }: { lead: LeadDetail }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isStudent = lead.recordType === "student";
  const label = isStudent ? "Chuyển trở lại ứng viên" : "Chuyển sang học viên";
  const mutation = useMutation({
    mutationFn: () => changeStudentMembership(lead.id, isStudent ? "candidate" : "student", auth.accessToken!),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all(["leads", "students", "customer-lists", "reports", "dashboard", "sale"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
  if (!auth.can(isStudent ? "student.revert_to_candidate" : "student.convert_from_lead")) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant={isStudent ? "outline" : "default"} disabled={mutation.isPending}
        onClick={() => { mutation.reset(); setOpen(true); }}>{label}</Button>
      <Dialog open={open} onOpenChange={(value) => { if (!mutation.isPending) setOpen(value); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {lead.fullName} sẽ được chuyển sang danh sách {isStudent ? "Lead" : "Học viên"}.
              Thông tin, giá trị tiến trình và lịch sử được giữ nguyên; hồ sơ vẫn nằm trong danh sách khách hàng Marketing.
            </DialogDescription>
          </DialogHeader>
          {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending && <Spinner />} {mutation.isPending ? "Đang chuyển…" : label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
