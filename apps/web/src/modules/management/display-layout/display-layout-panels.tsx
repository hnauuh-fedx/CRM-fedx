import { DisplayLayoutSample } from "./display-layout-sample";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  LayoutDraft,
  LayoutScreen,
  LayoutImpact,
} from "@admission-crm/shared/display-layout";
import { getDisplayFields } from "@admission-crm/shared/display-layout";
import type { LayoutDetail } from "@/services/display-layout.service";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function DisplayLayoutHistory({
  query,
  page,
  disabled,
  onPage,
  onRestore,
}: {
  query: UseQueryResult<LayoutDetail, Error>;
  page: number;
  disabled: boolean;
  onPage: (page: number) => void;
  onRestore: (version: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử phiên bản</CardTitle>
        <CardDescription>
          Khôi phục đưa bố cục vào bản nháp để xem lại trước khi áp dụng.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <VersionList query={query} disabled={disabled} onRestore={onRestore} />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1 || query.isFetching}
            onClick={() => onPage(page - 1)}
          >
            Trước
          </Button>
          <span>
            {page}/{query.data?.versionPages ?? 1}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={
              !query.data || page >= query.data.versionPages || query.isFetching
            }
            onClick={() => onPage(page + 1)}
          >
            Sau
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
function VersionList({
  query,
  disabled,
  onRestore,
}: {
  query: UseQueryResult<LayoutDetail, Error>;
  disabled: boolean;
  onRestore: (version: number) => void;
}) {
  if (query.isError)
    return (
      <p role="alert">
        Không tải được lịch sử.{" "}
        <Button type="button" variant="link" onClick={() => query.refetch()}>
          Thử lại
        </Button>
      </p>
    );
  if (query.isLoading) return <p role="status">Đang tải lịch sử…</p>;
  if (!query.data?.versions.length)
    return <p>Chưa có phiên bản được áp dụng.</p>;
  const fieldLabels = new Map(
    getDisplayFields(query.data.screen ?? "LEAD_LIST").map((field) => [
      field.key,
      field.label,
    ]),
  );
  return query.data.versions.map((version) => (
    <div
      key={version.version}
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
    >
      <div className="min-w-0">
        <p className="font-medium">
          Phiên bản {version.version} · {version.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {version.actorName} ·{" "}
          {new Date(version.createdAt).toLocaleString("vi-VN")}
        </p>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">
            Xem {version.visibleFields.length} trường của phiên bản này
          </summary>
          <ol className="mt-2 list-inside list-decimal">
            {version.visibleFields.map((key) => (
              <li key={key}>
                {fieldLabels.get(key) ?? "Trường đã ngừng sử dụng"}
              </li>
            ))}
          </ol>
        </details>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onRestore(version.version)}
      >
        Xem lại bản này
      </Button>
    </div>
  ));
}
export function DisplayLayoutPreview({
  screen = "LEAD_LIST",
  open,
  draft,
  impact,
  pending,
  error,
  onOpenChange,
  onPublish,
}: {
  screen?: LayoutScreen;
  open: boolean;
  draft?: LayoutDraft;
  impact?: LayoutImpact;
  pending: boolean;
  error: Error | null;
  onOpenChange: (open: boolean) => void;
  onPublish: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Xem trước: {draft?.name}</DialogTitle>
          <DialogDescription>
            Dữ liệu minh họa. Hãy kiểm tra bố cục và phạm vi ảnh hưởng trước khi
            áp dụng.
          </DialogDescription>
        </DialogHeader>
        {draft && <DisplayLayoutSample draft={draft} screen={screen} />}
        {impact && (
          <p>
            {impact.departments} phòng ban được chọn · {impact.users} nhân viên
            bị ảnh hưởng · {impact.overriddenUsers} nhân viên giữ mẫu riêng ·{" "}
            {impact.replacedAssignments} gán mẫu khác sẽ được thay thế.
          </p>
        )}
        {impact?.replacedTemplates?.map((template) => (
          <p key={template.name} className="text-sm">
            Thay thế mẫu “{template.name}” cho {template.assignments} đối tượng.
          </p>
        ))}
        {error && (
          <p role="alert" className="text-destructive">
            {error.message} Đóng cửa sổ và xem trước lại để tiếp tục.
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Đóng
          </Button>
          <Button
            type="button"
            disabled={pending || !impact || Boolean(error)}
            onClick={onPublish}
          >
            {pending ? "Đang áp dụng…" : "Áp dụng"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
