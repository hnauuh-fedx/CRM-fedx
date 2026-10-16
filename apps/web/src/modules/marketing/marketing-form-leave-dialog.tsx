import { useRef } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function MarketingFormLeaveDialog({ open, saving, dirty, programName, stay, leave }: {
  open: boolean; saving: boolean; dirty: boolean; programName?: string; stay: () => void; leave: () => void;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <AlertDialog open={open} onOpenChange={nextOpen => { if (!nextOpen) stay(); }}>
      <AlertDialogContent onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => {
        if (returnFocus.current?.isConnected) {
          event.preventDefault();
          returnFocus.current.focus();
        }
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{saving ? "Đang lưu cấu hình" : dirty ? "Bạn có thay đổi chưa lưu" : "Tiếp tục rời trang?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {saving ? "Vui lòng chờ yêu cầu lưu hoàn tất. Bạn có thể ở lại để kiểm tra kết quả lưu." : dirty ? "Rời trang sẽ bỏ các thay đổi chưa lưu. Chọn ở lại và bấm Lưu cấu hình để giữ thay đổi." : "Yêu cầu lưu đã hoàn tất. Bạn có thể ở lại để kiểm tra kết quả hoặc tiếp tục."}
            {programName && ` Nếu tiếp tục, chương trình làm việc sẽ đổi sang “${programName}” và mở danh sách Form & Survey của chương trình đó.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Ở lại</AlertDialogCancel>
          <AlertDialogAction type="button" disabled={saving} onClick={event => { event.preventDefault(); leave(); }}>{dirty ? "Bỏ thay đổi và tiếp tục" : "Tiếp tục"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
