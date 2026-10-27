import { ShieldAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AccessDeniedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional context for the specific restricted action; a generic explanation is shown otherwise. */
  description?: string;
};

/** Shared notice for any feature or record the current user is not allowed to act on. */
export function AccessDeniedDialog({ open, onOpenChange, description }: AccessDeniedDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <span aria-hidden="true" className="mx-auto mb-1 flex size-10 items-center sm:mx-0 justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </span>
          <AlertDialogTitle>Bạn không có quyền thao tác</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? "Tài khoản của bạn không có quyền truy cập dữ liệu hoặc chức năng này. Vui lòng liên hệ quản lý nếu cần hỗ trợ."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction className="min-h-11 sm:min-h-9">Đã hiểu</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
