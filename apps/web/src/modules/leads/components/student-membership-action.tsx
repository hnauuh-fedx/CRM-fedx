import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/auth-context";
import { changeStudentMembership, checkStudentConversion, type StudentConversionCheck } from "@/services/lead.service";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { LeadDetail } from "../lead.types";

export function StudentMembershipAction({ lead }: { lead: LeadDetail }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [missingFields, setMissingFields] = useState<StudentConversionCheck["missingFields"]>([]);
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
  // Required-for-student fields are checked before the confirmation dialog opens.
  const check = useMutation({
    mutationFn: () => checkStudentConversion(lead.id, auth.accessToken!),
    onSuccess: (result) => {
      setMissingFields(result.missingFields);
      if (!result.missingFields.length) setOpen(true);
    },
  });
  if (!auth.can(isStudent ? "student.revert_to_candidate" : "student.convert_from_lead")) return null;
  function start() {
    mutation.reset();
    setMissingFields([]);
    if (isStudent) setOpen(true);
    else check.mutate();
  }
  function closeCheckResult() {
    setMissingFields([]);
    check.reset();
  }
  return (
    <div className="flex flex-col items-start gap-2">
      {/* Floating result so the surrounding pipeline card keeps its height. */}
      <Popover open={missingFields.length > 0 || Boolean(check.error)} onOpenChange={(value) => { if (!value) closeCheckResult(); }}>
        <PopoverAnchor asChild>
          <Button type="button" variant={isStudent ? "outline" : "default"} disabled={mutation.isPending || check.isPending}
            onClick={start}>
            {check.isPending && <Spinner />} {check.isPending ? "Đang kiểm tra…" : label}
          </Button>
        </PopoverAnchor>
        <PopoverContent side="bottom" align="end" className="w-80 border-destructive/40" role="alert">
          <PopoverHeader>
            <PopoverTitle className="text-destructive">Chưa thể chuyển sang học viên</PopoverTitle>
            <PopoverDescription>
              {check.error ? check.error.message : "Vui lòng bổ sung dữ liệu cho các trường bắt buộc sau:"}
            </PopoverDescription>
          </PopoverHeader>
          {missingFields.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-destructive">
              {missingFields.map((field) => <li key={field.key}>{field.label}</li>)}
            </ul>
          )}
        </PopoverContent>
      </Popover>
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
