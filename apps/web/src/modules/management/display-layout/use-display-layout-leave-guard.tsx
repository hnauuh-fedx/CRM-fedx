import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DisplayLayoutLeaveGuard({
  dirty,
  saving,
}: {
  dirty: boolean;
  saving: boolean;
}) {
  const { registerProgramChangeGuard, selectProgram } = useInstitutionProgram();
  const [programId, setProgramId] = useState<string | null>(null);
  const approved = useRef<string | null>(null);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty || saving) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(
    () =>
      registerProgramChangeGuard((next) => {
        if (approved.current === next) return true;
        if (!dirty && !saving) return true;
        setProgramId(next);
        return false;
      }),
    [dirty, saving, registerProgramChangeGuard],
  );
  useEffect(() => {
    if (!dirty && !saving) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, saving]);
  function stay() {
    setProgramId(null);
    if (blocker.state === "blocked") blocker.reset();
  }
  return (
    <AlertDialog
      open={blocker.state === "blocked" || programId !== null}
      onOpenChange={(open) => {
        if (!open) stay();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {saving ? "Đang lưu cấu hình" : "Bạn có thay đổi chưa lưu"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {saving
              ? "Chờ yêu cầu hoàn tất trước khi rời trang."
              : "Rời trang hoặc đổi mẫu sẽ bỏ các thay đổi chưa lưu. Bạn có thể ở lại và lưu nháp."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={stay}>Ở lại</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={() => {
              if (blocker.state === "blocked") blocker.proceed();
              else if (programId) {
                approved.current = programId;
                selectProgram(programId);
                approved.current = null;
              }
              setProgramId(null);
            }}
          >
            Bỏ thay đổi và tiếp tục
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
