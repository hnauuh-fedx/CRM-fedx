import { useState } from "react";
import { useForm, type FieldPathValue } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDisplayFields,
  type LayoutScreen,
  layoutIssues,
  presentationIssues,
  type DisplayLayout,
  type LayoutDraft,
} from "@admission-crm/shared/display-layout";
import { useAuth } from "@/modules/auth/auth-context";
import {
  getDisplayLayout,
  saveDisplayLayout,
  previewDisplayLayout,
  publishDisplayLayout,
  restoreDisplayLayout,
} from "@/services/display-layout.service";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";

export const defaultDraft = (
  screen: LayoutScreen = "LEAD_LIST",
): LayoutDraft => ({
  name: "",
  visibleFields: getDisplayFields(screen).map((field) => field.key),
  targets: [],
});
export function useDisplayLayoutEditor({
  initial,
  screen = initial?.screen ?? "LEAD_LIST",
  onPublished,
}: {
  initial: DisplayLayout | null;
  screen?: LayoutScreen;
  onPublished?: () => void;
}) {
  const fields = getDisplayFields(screen);
  const fieldKeys = new Set(fields.map((field) => field.key));
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const client = useQueryClient();
  const [state, setState] = useState({
    item: initial,
    departmentId: initial?.managementDepartmentId ?? "",
    preview: false,
    versionPage: 1,
    message: "",
  });
  const form = useForm<LayoutDraft>({
    defaultValues: initial?.draft ?? defaultDraft(screen),
  });
  const draft = form.watch();
  const detail = useQuery({
    queryKey: [
      "display-layout-detail",
      selectedProgramId,
      state.item?.id,
      state.item?.revision,
      state.versionPage,
    ],
    queryFn: () =>
      getDisplayLayout(auth.accessToken!, state.item!.id, state.versionPage),
    enabled: Boolean(state.item),
  });
  const save = useMutation({
    mutationFn: () => {
      const issues = layoutIssues(draft, fields);
      issues.push(
        ...presentationIssues(
          {
            visibleFields: draft.visibleFields,
            pinnedFields: draft.pinnedFields ?? [],
            columnWidths: draft.columnWidths ?? {},
          },
          fields.map((field) => field.key),
        ),
      );
      if (issues.length) throw new Error(issues.join(" "));
      if (
        !state.item &&
        auth.user?.accessScope !== "ALL" &&
        !state.departmentId
      )
        throw new Error("Vui lòng chọn phòng ban sở hữu mẫu.");
      return saveDisplayLayout(
        auth.accessToken!,
        draft,
        state.departmentId || null,
        state.item,
        screen,
      );
    },
    onSuccess: (item) =>
      accept(item, "Đã lưu nháp. Giao diện đang sử dụng chưa thay đổi."),
  });
  const preview = useMutation({
    mutationFn: () => previewDisplayLayout(auth.accessToken!, state.item!),
    onSuccess: () => setState((current) => ({ ...current, preview: true })),
  });
  const publish = useMutation({
    mutationFn: () =>
      publishDisplayLayout(
        auth.accessToken!,
        state.item!,
        preview.data!.assignmentRevision,
      ),
    onSuccess: (item) => {
      accept(
        item,
        onPublished
          ? "Đã áp dụng. Bảng đang xem cập nhật theo mẫu hiệu lực."
          : "Đã áp dụng. Nhân viên nhận giao diện mới khi mở lại hoặc tải lại màn hình tương ứng.",
      );
      setState((current) => ({ ...current, preview: false }));
      preview.reset();
      onPublished?.();
    },
  });
  const restore = useMutation({
    mutationFn: (version: number) =>
      restoreDisplayLayout(auth.accessToken!, state.item!, version),
    onSuccess: (item) =>
      accept(
        item,
        "Đã đưa bố cục cũ vào bản nháp. Kiểm tra và áp dụng để tạo phiên bản mới; đối tượng áp dụng được giữ nguyên.",
      ),
  });
  const reload = useMutation({
    mutationFn: () => getDisplayLayout(auth.accessToken!, state.item!.id),
    onSuccess: (item) => {
      save.reset();
      preview.reset();
      publish.reset();
      restore.reset();
      accept(item, "Đã tải lại phiên bản mới nhất.");
    },
  });
  const busy =
    save.isPending ||
    publish.isPending ||
    restore.isPending ||
    preview.isPending ||
    reload.isPending;
  const dirty = form.formState.isDirty;
  const error =
    save.error ??
    preview.error ??
    publish.error ??
    restore.error ??
    reload.error;
  const unknown = draft.visibleFields.filter((key) => !fieldKeys.has(key));
  function accept(item: DisplayLayout, message: string) {
    form.reset(item.draft);
    setState((current) => ({ ...current, item, message }));
    void client.invalidateQueries({ queryKey: ["display-layouts"] });
    void client.invalidateQueries({ queryKey: ["display-layout-detail"] });
  }
  function edit<K extends keyof LayoutDraft>(key: K, value: LayoutDraft[K]) {
    if (key === "visibleFields") {
      const visible = new Set(value as string[]);
      form.setValue(
        "pinnedFields",
        (form.getValues("pinnedFields") ?? []).filter((field) =>
          visible.has(field),
        ),
        { shouldDirty: true },
      );
      form.setValue(
        "columnWidths",
        Object.fromEntries(
          Object.entries(form.getValues("columnWidths") ?? {}).filter(
            ([field]) => visible.has(field),
          ),
        ),
        { shouldDirty: true },
      );
    }
    form.setValue(key, value as FieldPathValue<LayoutDraft, K>, {
      shouldDirty: true,
      shouldValidate: true,
    });
    preview.reset();
    save.reset();
    publish.reset();
    restore.reset();
    setState((current) => ({ ...current, message: "" }));
  }
  return {
    screen,
    fields,
    auth,
    state,
    setState,
    form,
    draft,
    detail,
    save,
    preview,
    publish,
    restore,
    reload,
    busy,
    dirty,
    error,
    unknown,
    edit,
  };
}
