import { DisplayLayoutSample } from "./display-layout-sample";
import { DisplayLayoutOwnerPicker } from "./display-layout-owner-picker";
import {
  DisplayColumnSettings,
  DisplayPersonalizationPolicy,
} from "./display-column-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import {
  DisplayLayoutHistory,
  DisplayLayoutPreview,
} from "./display-layout-panels";
import { DisplayFieldEditor } from "./display-field-editor";
import { DisplayTargetPicker } from "./display-target-picker";
import { DisplayLayoutLeaveGuard } from "./use-display-layout-leave-guard";
import {
  layoutScreenLabels,
  isListLayoutScreen,
  type LayoutScreen,
  lockedPersonalization,
  type DisplayLayout,
} from "@admission-crm/shared/display-layout";
import {
  defaultDraft,
  useDisplayLayoutEditor,
} from "./use-display-layout-editor";

type EditorModel = ReturnType<typeof useDisplayLayoutEditor>;
export function DisplayLayoutEditor({
  initial,
  screen = initial?.screen ?? "LEAD_LIST",
}: {
  initial: DisplayLayout | null;
  screen?: LayoutScreen;
}) {
  const model = useDisplayLayoutEditor({ initial, screen });
  return <DisplayLayoutEditorContent model={model} />;
}
export function DisplayLayoutEditorContent({ model }: { model: EditorModel }) {
  const screen = model.screen;
  const {
    state,
    setState,
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
  } = model;
  const unknownSet = new Set(unknown);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DisplayLayoutLeaveGuard dirty={dirty} saving={busy} />
      <DisplayLayoutMetadata model={model} />
      {unknown.length > 0 && (
        <Alert>
          <AlertTitle>Có trường đã ngừng sử dụng</AlertTitle>
          <AlertDescription>
            {unknown.join(", ")}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                edit(
                  "visibleFields",
                  draft.visibleFields.filter((key) => !unknownSet.has(key)),
                )
              }
            >
              Bỏ các trường này khỏi bản nháp
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <DisplayFieldEditor
        fields={model.fields}
        visible={draft.visibleFields}
        disabled={busy}
        onChange={(keys) => edit("visibleFields", keys)}
        knownFields={draft.knownFields}
      />
      <details
        className="min-w-0 rounded-xl border bg-card p-4"
        data-testid="layout-live-preview"
      >
        <summary className="cursor-pointer rounded-sm py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring">
          Xem thử bố cục đang chỉnh
        </summary>
        <p className="mb-4 mt-2 text-sm text-muted-foreground">
          Dữ liệu minh họa cập nhật theo thay đổi của bạn. Chưa lưu hoặc áp dụng
          cho nhân viên.
        </p>
        <DisplayLayoutSample draft={draft} screen={screen} />
      </details>
      {isListLayoutScreen(screen) && (
        <DisplayLayoutPresentationControls model={model} />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Phân bổ mẫu</CardTitle>
          <CardDescription>
            Bỏ chọn Sale để người đó quay về mẫu phòng ban hoặc mẫu chung sau
            khi áp dụng. Việc ẩn trường không thay đổi quyền xem dữ liệu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayTargetPicker
            targets={draft.targets}
            departmentId={
              state.item?.managementDepartmentId ?? (state.departmentId || null)
            }
            disabled={busy}
            onChange={(targets) => edit("targets", targets)}
            labels={detail.data?.targetLabels}
          />
          {detail.data && (
            <p className="mt-4 text-sm text-muted-foreground">
              Hiện có {detail.data.assignments.length} đối tượng đang được gán
              mẫu này. Bản nháp có {draft.targets.length} đối tượng.
            </p>
          )}
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Chưa hoàn tất thao tác</AlertTitle>
          <AlertDescription>
            {error.message}
            {state.item && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => reload.mutate()}
              >
                Bỏ thay đổi và tải lại mẫu
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {state.message && (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      )}
      {state.item && (
        <DisplayLayoutHistory
          query={detail}
          page={state.versionPage}
          disabled={busy || dirty}
          onPage={(page) =>
            setState((current) => ({ ...current, versionPage: page }))
          }
          onRestore={(version) => {
            save.reset();
            publish.reset();
            restore.mutate(version);
          }}
        />
      )}
      <DisplayLayoutActions model={model} />
      <DisplayLayoutPreview
        screen={screen}
        open={state.preview}
        draft={state.item?.draft}
        impact={preview.data}
        pending={publish.isPending}
        error={publish.error}
        onOpenChange={(open) =>
          setState((current) => ({ ...current, preview: open }))
        }
        onPublish={() => publish.mutate()}
      />
    </div>
  );
}

function DisplayLayoutPresentationControls({ model }: { model: EditorModel }) {
  const { draft, busy, edit } = model;
  return (
    <>
      <DisplayColumnSettings
        presentation={{
          visibleFields: draft.visibleFields,
          pinnedFields: draft.pinnedFields ?? [],
          columnWidths: draft.columnWidths ?? {},
        }}
        disabled={busy}
        onChange={(next) => {
          edit("pinnedFields", next.pinnedFields);
          edit("columnWidths", next.columnWidths);
        }}
      />
      <DisplayPersonalizationPolicy
        policy={draft.personalization ?? lockedPersonalization}
        disabled={busy}
        onChange={(next) => edit("personalization", next)}
      />
    </>
  );
}

function DisplayLayoutMetadata({ model }: { model: EditorModel }) {
  const { auth, state, setState, form, busy, dirty, edit } = model;
  const owner = state.item?.managementDepartmentId ?? state.departmentId;
  const scopeLabel = owner ? "Trong phòng ban sở hữu mẫu" : auth.user?.accessScope === "ALL" ? "Toàn bộ chương trình đang chọn" : "Chưa chọn phòng ban sở hữu mẫu";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{state.item ? "Chỉnh sửa mẫu" : "Tạo mẫu mới"}</CardTitle>
        <CardDescription>
          {layoutScreenLabels[model.screen]} · Mẫu riêng của Sale ưu tiên hơn
          mẫu phòng ban và mẫu chung.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {state.item?.publishedVersion
                ? `Đã áp dụng phiên bản ${state.item.publishedVersion}`
                : "Bản nháp"}
            </Badge>
            {dirty && <Badge variant="outline">Chưa lưu</Badge>}
          </div>
          <Field data-invalid={Boolean(form.formState.errors.name)}>
            <FieldLabel htmlFor="display-layout-name">Tên mẫu</FieldLabel>
            <Input
              id="display-layout-name"
              disabled={busy}
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register("name", {
                required: "Vui lòng nhập tên mẫu.",
                minLength: {
                  value: 2,
                  message: "Tên mẫu cần ít nhất 2 ký tự.",
                },
                maxLength: 120,
              })}
            />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </Field>
          {!state.item && (
            <DisplayLayoutOwnerPicker
              value={state.departmentId}
              disabled={busy}
              onChange={(value) => {
                setState((current) => ({ ...current, departmentId: value }));
                edit("targets", []);
              }}
            />
          )}
          <p className="text-sm text-muted-foreground">
            Phạm vi quản lý:{" "}
            {scopeLabel}
            . Người thuộc nhiều phòng ban dùng mẫu riêng hoặc mẫu chung vì hệ
            thống chưa có phòng ban chính.
          </p>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function DisplayLayoutActions({ model }: { model: EditorModel }) {
  const {
    state,
    draft,
    form,
    save,
    preview,
    publish,
    restore,
    busy,
    dirty,
    edit,
    screen,
  } = model;
  return (
    <div
      data-testid="layout-save-bar"
      className="bottom-0 z-10 flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm lg:sticky"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={dirty || !state.item ? "secondary" : "outline"}>
          {dirty || !state.item ? "Chưa lưu thay đổi" : "Bố cục đã lưu nháp"}
        </Badge>
        <span className="text-muted-foreground">
          {draft.visibleFields.length} trường hiển thị · {draft.targets.length}{" "}
          đối tượng áp dụng
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            save.reset();
            preview.reset();
            publish.reset();
            restore.reset();
            void form.handleSubmit(() => save.mutate())();
          }}
        >
          {save.isPending ? "Đang lưu…" : "Lưu nháp"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || dirty || !state.item}
          onClick={() => {
            publish.reset();
            preview.mutate();
          }}
        >
          Xem trước và áp dụng
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            edit(
              "visibleFields",
              model.fields.map((field) => field.key),
            )
          }
        >
          Khôi phục mặc định
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !dirty}
          onClick={() => {
            form.reset(state.item?.draft ?? defaultDraft(screen));
            save.reset();
            preview.reset();
            publish.reset();
            restore.reset();
          }}
        >
          Hủy thay đổi
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Lưu nháp trước khi xem phạm vi ảnh hưởng và áp dụng. Trường mới được
        thêm sau này sẽ nằm trong Chưa hiển thị của các mẫu đã lưu.
      </p>
    </div>
  );
}
