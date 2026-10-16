import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, X, Plus } from "lucide-react";
import {
  layoutScreenLabels,
  type EffectiveLayout,
  type DisplayLayout,
  type ListLayoutScreen,
} from "@admission-crm/shared/display-layout";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import {
  getDisplayLayout,
  getDisplayLayouts,
} from "@/services/display-layout.service";
import { DisplayLayoutEditorContent } from "@/modules/management/display-layout/display-layout-editor";
import { useDisplayLayoutEditor } from "@/modules/management/display-layout/use-display-layout-editor";
import { DisplayLayoutList } from "@/modules/management/display-layout/display-layout-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type Context = {
  screen: ListLayoutScreen;
  onClose: () => void;
  onSelect: (id: string) => void;
};
export function ListDisplayLayoutDialog({
  screen,
  layout,
}: {
  screen: ListLayoutScreen;
  layout?: EffectiveLayout;
}) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [open, setOpen] = useState(false);
  const canManage =
    auth.can("system.manage") &&
    (auth.user?.accessScope === "ALL" ||
      (auth.user?.accessScope === "DEPARTMENT" &&
        Boolean(auth.user.departmentIds.length)));
  if (!canManage) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          data-testid="edit-list-display-layout"
        >
          <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
          Chỉnh sửa giao diện
        </Button>
      </DialogTrigger>
      {open && (
        <ListLayoutWorkspace
          key={`${selectedProgramId}-${auth.user?.id}-${screen}`}
          screen={screen}
          initialId={
            auth.user?.accessScope === "ALL" ? layout?.baseTemplateId : null
          }
          onClose={() => setOpen(false)}
        />
      )}
    </Dialog>
  );
}
function ListLayoutWorkspace({
  screen,
  initialId,
  onClose,
}: {
  screen: ListLayoutScreen;
  initialId?: string | null;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState({
    id: initialId ?? null,
    revision: 0,
  });
  return (
    <ListLayoutEntry
      key={`${selected.id ?? "choose"}-${selected.revision}`}
      screen={screen}
      selected={selected.id}
      onSelect={(id) =>
        setSelected((current) => ({ id, revision: current.revision + 1 }))
      }
      onClose={onClose}
    />
  );
}
function ListLayoutEntry({
  screen,
  selected,
  onSelect,
  onClose,
}: Context & { selected: string | null }) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const detail = useQuery({
    queryKey: [
      "display-layout-popup",
      selectedProgramId,
      auth.user?.id,
      screen,
      selected,
    ],
    queryFn: () => getDisplayLayout(auth.accessToken!, selected!),
    enabled: Boolean(selected && selected !== "new"),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
  });
  if (selected === "new")
    return (
      <PopupLayoutEditor
        screen={screen}
        initial={null}
        onSelect={onSelect}
        onClose={onClose}
      />
    );
  if (detail.data && !detail.isFetching && detail.data.screen === screen)
    return (
      <PopupLayoutEditor
        screen={screen}
        initial={detail.data}
        onSelect={onSelect}
        onClose={onClose}
      />
    );
  return (
    <LayoutPopupFrame screen={screen} onClose={onClose}>
      <PopupTemplatePicker
        screen={screen}
        selected={selected}
        onSelect={onSelect}
      />
      {detail.isFetching && <Skeleton className="h-80 w-full" />}
      {detail.isError && (
        <p role="alert" className="text-sm text-destructive">
          Không mở được mẫu trong phạm vi quản lý. Hãy chọn mẫu khác hoặc tạo
          mẫu mới.
        </p>
      )}
    </LayoutPopupFrame>
  );
}

function PopupLayoutEditor({
  initial,
  screen,
  onSelect,
  onClose,
}: Context & { initial: DisplayLayout | null }) {
  const auth = useAuth();
  const client = useQueryClient();
  const { selectedProgramId } = useInstitutionProgram();
  const model = useDisplayLayoutEditor({
    initial,
    screen,
    onPublished: () => {
      void client.invalidateQueries({
        queryKey: [
          "lead-display-layout",
          selectedProgramId,
          auth.user?.id,
          screen,
        ],
      });
    },
  });
  const [pending, setPending] = useState<{ id: string | null } | null>(null);
  function proceed(id: string | null) {
    if (id === null) onClose();
    else onSelect(id);
  }
  function request(id: string | null) {
    if (model.busy) return;
    if (model.dirty) setPending({ id });
    else proceed(id);
  }
  return (
    <>
      <LayoutPopupFrame
        screen={screen}
        onClose={() => request(null)}
        busy={model.busy}
      >
        <PopupTemplatePicker
          screen={screen}
          selected={model.state.item?.id ?? "new"}
          onSelect={(id) => request(id)}
          disabled={model.busy}
        />
        <DisplayLayoutEditorContent model={model} />
      </LayoutPopupFrame>
      <AlertDialog
        open={pending !== null}
        onOpenChange={(value) => {
          if (!value) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bỏ thay đổi chưa lưu?</AlertDialogTitle>
            <AlertDialogDescription>
              Đóng cửa sổ hoặc đổi mẫu sẽ bỏ các thay đổi chưa lưu. Bạn có thể ở
              lại để lưu nháp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ở lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) proceed(pending.id);
                setPending(null);
              }}
            >
              Bỏ thay đổi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function LayoutPopupFrame({
  screen,
  onClose,
  busy = false,
  children,
}: {
  screen: ListLayoutScreen;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <DialogContent
      showCloseButton={false}
      className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-clip p-0 sm:max-w-[calc(100vw-2rem)] xl:max-w-7xl"
      data-testid="list-layout-popup"
      onEscapeKeyDown={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDownOutside={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <DialogHeader className="shrink-0 border-b px-5 py-4 pr-16">
        <DialogTitle>
          Chỉnh sửa giao diện · {layoutScreenLabels[screen]}
        </DialogTitle>
        <DialogDescription>
          Cấu hình riêng cho{" "}
          {layoutScreenLabels[screen].toLocaleLowerCase("vi")}. Lưu nháp, xem
          phạm vi ảnh hưởng rồi áp dụng.
        </DialogDescription>
      </DialogHeader>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 size-11"
        aria-label="Đóng chỉnh sửa giao diện"
        disabled={busy}
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </Button>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-5">
        {children}
      </div>
    </DialogContent>
  );
}
function PopupTemplatePicker({
  screen,
  selected,
  onSelect,
  disabled = false,
}: {
  screen: ListLayoutScreen;
  selected: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [state, setState] = useState({ page: 1, search: "" });
  const list = useQuery({
    queryKey: [
      "display-layouts",
      selectedProgramId,
      auth.user?.id,
      screen,
      state.page,
      state.search,
    ],
    queryFn: () =>
      getDisplayLayouts(auth.accessToken!, state.page, state.search, screen),
  });
  return (
    <details open={selected === null} className="min-w-0 rounded-xl border p-4">
      <summary className="cursor-pointer rounded-sm py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
        Chọn mẫu hoặc tạo mẫu mới
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="popup-layout-search">
            Tìm mẫu {layoutScreenLabels[screen].toLocaleLowerCase("vi")}
          </FieldLabel>
          <Input
            id="popup-layout-search"
            disabled={disabled}
            value={state.search}
            onChange={(event) =>
              setState({ page: 1, search: event.target.value })
            }
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={disabled}
          onClick={() => onSelect("new")}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Tạo mẫu mới
        </Button>
        <fieldset disabled={disabled} className="min-w-0">
          <legend className="sr-only">Mẫu trong phạm vi quản lý</legend>
          <DisplayLayoutList
            query={list}
            selected={selected}
            page={state.page}
            onSelect={onSelect}
            onPage={(page) => setState((current) => ({ ...current, page }))}
          />
        </fieldset>
      </div>
    </details>
  );
}
