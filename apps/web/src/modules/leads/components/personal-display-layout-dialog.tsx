import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import {
  leadDisplayFields,
  personalPresentationIssues,
  type EffectiveLayout,
  type ListLayoutScreen,
  type LayoutPresentation,
} from "@admission-crm/shared/display-layout";
import {
  savePersonalDisplayLayout,
  resetPersonalDisplayLayout,
  getEffectiveDisplayLayout,
} from "@/services/display-layout.service";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { DisplayFieldEditor } from "@/modules/management/display-layout/display-field-editor";
import { DisplayColumnSettings } from "@/modules/management/display-layout/display-column-settings";
import { DisplayLayoutLeaveGuard } from "@/modules/management/display-layout/use-display-layout-leave-guard";

export function PersonalDisplayLayoutDialog({
  layout,
  screen = "LEAD_LIST",
}: {
  layout: EffectiveLayout;
  screen?: ListLayoutScreen;
}) {
  const [open, setOpen] = useState(false);
  if (!layout.policy || !Object.values(layout.policy).some(Boolean))
    return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Giao diện cá nhân
        </Button>
      </DialogTrigger>
      {open && (
        <PersonalLayoutForm
          key={`${layout.baseTemplateId}-${layout.baseVersion}-${layout.personalRevision}`}
          layout={layout}
          screen={screen}
          onClose={() => setOpen(false)}
        />
      )}
    </Dialog>
  );
}
function PersonalLayoutForm({
  layout,
  onClose,
  screen,
}: {
  screen: ListLayoutScreen;
  layout: EffectiveLayout;
  onClose: () => void;
}) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const client = useQueryClient();
  const initial: LayoutPresentation = {
    visibleFields: layout.visibleFields,
    pinnedFields: layout.pinnedFields,
    columnWidths: layout.columnWidths,
  };
  const [state, setState] = useState({ presentation: initial, discard: false });
  const dirty = JSON.stringify(initial) !== JSON.stringify(state.presentation);
  const queryKey = [
    "lead-display-layout",
    selectedProgramId,
    auth.user?.id,
    screen,
  ];
  const save = useMutation({
    mutationFn: () => {
      const issues = personalPresentationIssues(
        state.presentation,
        layout.inherited,
        layout.policy,
      );
      if (issues.length) throw new Error(issues.join(" "));
      return savePersonalDisplayLayout(
        auth.accessToken!,
        {
          revision: layout.personalRevision,
          baseTemplateId: layout.baseTemplateId!,
          baseVersion: layout.baseVersion,
          presentation: state.presentation,
        },
        screen,
      );
    },
    onSuccess: (result) => {
      client.setQueryData(queryKey, result);
      onClose();
    },
  });
  const reset = useMutation({
    mutationFn: () =>
      resetPersonalDisplayLayout(
        auth.accessToken!,
        layout.personalRevision,
        screen,
      ),
    onSuccess: (result) => {
      client.setQueryData(queryKey, result);
      onClose();
    },
  });
  const reload = useMutation({
    mutationFn: () => getEffectiveDisplayLayout(auth.accessToken!, screen),
    onSuccess: (result) => {
      client.setQueryData(queryKey, result);
      onClose();
    },
  });
  const busy = save.isPending || reset.isPending || reload.isPending;
  const fieldsByKey = new Map(
    leadDisplayFields.map((field) => [field.key, field]),
  );
  const fields = layout.inherited.visibleFields.flatMap((key) => {
    const field = fieldsByKey.get(key);
    return field ? [field] : [];
  });
  const error = save.error ?? reset.error ?? reload.error;
  function change(presentation: LayoutPresentation) {
    save.reset();
    reset.reset();
    setState((current) => ({ ...current, presentation }));
  }
  return (
    <>
      <DisplayLayoutLeaveGuard dirty={dirty} saving={busy} />
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl"
        onEscapeKeyDown={(event) => {
          if (busy || dirty) {
            event.preventDefault();
            if (!busy) setState((current) => ({ ...current, discard: true }));
          }
        }}
        onPointerDownOutside={(event) => {
          if (busy || dirty) {
            event.preventDefault();
            if (!busy) setState((current) => ({ ...current, discard: true }));
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Giao diện cá nhân</DialogTitle>
          <DialogDescription>
            Tùy chỉnh chỉ áp dụng cho tài khoản của bạn trong chương trình hiện
            tại. Kế thừa từ “{layout.name}”. Chỉ các thao tác được quản lý cho
            phép mới khả dụng.
          </DialogDescription>
        </DialogHeader>
        <DisplayFieldEditor
          fields={fields}
          visible={state.presentation.visibleFields}
          disabled={busy}
          allowVisibility={layout.policy.visibility}
          allowOrder={layout.policy.order}
          onChange={(visibleFields) => {
            const allowed = new Set(visibleFields);
            change({
              visibleFields,
              pinnedFields: (layout.policy.pinning
                ? state.presentation.pinnedFields
                : layout.inherited.pinnedFields
              ).filter((key) => allowed.has(key)),
              columnWidths: Object.fromEntries(
                Object.entries(
                  layout.policy.widths
                    ? state.presentation.columnWidths
                    : layout.inherited.columnWidths,
                ).filter(([key]) => allowed.has(key)),
              ),
            });
          }}
        />
        <DisplayColumnSettings
          presentation={state.presentation}
          disabled={busy}
          canPin={layout.policy.pinning}
          canResize={layout.policy.widths}
          onChange={change}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => reload.mutate()}
            >
              Bỏ thay đổi và tải lại giao diện
            </Button>
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (dirty) setState((current) => ({ ...current, discard: true }));
              else onClose();
            }}
          >
            Đóng
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              busy || (!layout.personalized && !layout.personalizationStale)
            }
            onClick={() => reset.mutate()}
          >
            Dùng lại mẫu quản lý
          </Button>
          <Button
            type="button"
            disabled={busy || !dirty}
            onClick={() => save.mutate()}
          >
            {busy ? "Đang lưu…" : "Lưu giao diện cá nhân"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog
        open={state.discard}
        onOpenChange={(discard) =>
          setState((current) => ({ ...current, discard }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bỏ thay đổi chưa lưu?</AlertDialogTitle>
            <AlertDialogDescription>
              Giao diện đang sử dụng được giữ nguyên nếu bạn đóng cửa sổ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ở lại</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Bỏ thay đổi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
