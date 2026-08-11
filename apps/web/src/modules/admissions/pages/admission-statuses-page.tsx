import { useReducer, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import {
  createAdmissionStatus,
  deleteAdmissionStatus,
  getAdmissionStatusFlow,
  getAdmissionStatusList,
  updateAdmissionStatus,
  updateAdmissionStatusFlow,
  type AdmissionStatusSortField,
} from "@/services/admission.service";
import type { AdmissionStatusFlowResponse, AdmissionStatusInput, AdmissionStatusItem } from "../admission.types";

const pageSize = 20;
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

type State = {
  page: number;
  search: string;
  appliedSearch: string;
  sortBy: AdmissionStatusSortField;
  sortOrder: "asc" | "desc";
};

type Action =
  | { type: "setSearch"; value: string }
  | { type: "applyFilters" }
  | { type: "resetFilters" }
  | { type: "setPage"; page: number }
  | { type: "toggleSort"; sortBy: AdmissionStatusSortField };

type DialogState =
  | { type: "create" }
  | { type: "edit"; status: AdmissionStatusItem }
  | { type: "delete"; status: AdmissionStatusItem }
  | null;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setSearch":
      return { ...state, search: action.value };
    case "applyFilters":
      return { ...state, page: 1, appliedSearch: state.search };
    case "resetFilters":
      return { ...state, page: 1, search: "", appliedSearch: "" };
    case "setPage":
      return { ...state, page: action.page };
    case "toggleSort":
      return {
        ...state,
        page: 1,
        sortBy: action.sortBy,
        sortOrder: state.sortBy === action.sortBy && state.sortOrder === "desc" ? "asc" : "desc",
      };
    default:
      return state;
  }
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Không thể thực hiện thao tác.";
}

export function AdmissionStatusesPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage = auth.can("admission_status.update");
  const [state, dispatch] = useReducer(reducer, {
    page: 1,
    search: "",
    appliedSearch: "",
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const [dialog, setDialog] = useState<DialogState>(null);

  const listQuery = useQuery({
    queryKey: ["admissions", "statuses", state.page, pageSize, state.sortBy, state.sortOrder, state.appliedSearch],
    queryFn: () =>
      getAdmissionStatusList(
        {
          page: state.page,
          limit: pageSize,
          search: state.appliedSearch,
          sortBy: state.sortBy,
          sortOrder: state.sortOrder,
        },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const flowQuery = useQuery({
    queryKey: ["admissions", "statuses", "flow"],
    queryFn: () => getAdmissionStatusFlow(auth.accessToken!),
  });

  const invalidateStatuses = () => queryClient.invalidateQueries({ queryKey: ["admissions", "statuses"] });
  const createMutation = useMutation({
    mutationFn: (input: AdmissionStatusInput) => createAdmissionStatus(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateStatuses();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdmissionStatusInput }) =>
      updateAdmissionStatus(id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateStatuses();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdmissionStatus(id, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateStatuses();
    },
  });
  const flowMutation = useMutation({
    mutationFn: ({ fromStatusId, toStatusIds }: { fromStatusId: string; toStatusIds: string[] }) =>
      updateAdmissionStatusFlow(fromStatusId, toStatusIds, auth.accessToken!),
    onSuccess: () => invalidateStatuses(),
  });

  const statuses = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Tuyển sinh"
        title="Trạng thái hồ sơ"
        scopeLabel="Theo phạm vi truy cập"
        description="Quản lý trạng thái xử lý hồ sơ và luồng chuyển trạng thái trong tuyển sinh."
        actions={
          canManage ? (
            <Button type="button" onClick={() => { createMutation.reset(); setDialog({ type: "create" }); }}>
              <Plus aria-hidden="true" />
              Thêm trạng thái
            </Button>
          ) : undefined
        }
      />
      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle>Bộ lọc trạng thái</CardTitle>
          <CardDescription>Tìm theo tên hoặc mã trạng thái hồ sơ.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form onSubmit={(event) => { event.preventDefault(); dispatch({ type: "applyFilters" }); }}>
            <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_auto]">
              <Field className="gap-2">
                <FieldLabel htmlFor="admission-status-search">Tìm kiếm</FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="admission-status-search" className="pl-9" placeholder="Nhập tên hoặc mã trạng thái" value={state.search} onChange={(event) => dispatch({ type: "setSearch", value: event.target.value })} />
                </div>
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit">Áp dụng</Button>
                <Button type="button" variant="outline" onClick={() => dispatch({ type: "resetFilters" })}>Xóa lọc</Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
        <CardHeader className="gap-1 border-b py-5">
          <CardTitle>Trạng thái hồ sơ</CardTitle>
          <CardDescription>{pagination ? `Hiển thị ${statuses.length} trong tổng số ${pagination.total} trạng thái` : "Đang lấy dữ liệu trạng thái..."}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải danh sách trạng thái" description="Vui lòng thử lại để cập nhật danh sách trạng thái hồ sơ." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách trạng thái" />
          ) : statuses.length === 0 ? (
            <EmptyState title="Chưa có trạng thái phù hợp" description="Điều chỉnh bộ lọc hoặc thêm trạng thái hồ sơ mới." />
          ) : (
            <Table className="min-w-220">
              <caption className="sr-only">Danh sách trạng thái hồ sơ tuyển sinh</caption>
              <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
                <TableRow className="hover:bg-muted/55">
                  <SortableHead label="Tên trạng thái" sortBy="name" state={state} onSort={(sortBy) => dispatch({ type: "toggleSort", sortBy })} />
                  <SortableHead label="Mã" sortBy="code" state={state} onSort={(sortBy) => dispatch({ type: "toggleSort", sortBy })} />
                  <TableHead className="px-5 font-medium text-muted-foreground">Màu hiển thị</TableHead>
                  <TableHead className="px-5 font-medium text-muted-foreground">Số hồ sơ</TableHead>
                  <SortableHead label="Ngày tạo" sortBy="createdAt" state={state} onSort={(sortBy) => dispatch({ type: "toggleSort", sortBy })} />
                  {canManage && <TableHead className="px-5 text-right font-medium text-muted-foreground">Thao tác</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {statuses.map((status) => (
                  <TableRow key={status.id}>
                    <TableCell className="px-5 py-4 font-medium">{status.name}</TableCell>
                    <TableCell className="px-5 py-4">{status.code}</TableCell>
                    <TableCell className="px-5 py-4"><ColorBadge status={status} /></TableCell>
                    <TableCell className="px-5 py-4">{status.profileCount}</TableCell>
                    <TableCell className="px-5 py-4">{formatDate(status.createdAt)}</TableCell>
                    {canManage && (
                      <TableCell className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => { updateMutation.reset(); setDialog({ type: "edit", status }); }} aria-label={`Sửa trạng thái ${status.name}`}>
                            <Pencil aria-hidden="true" />
                            Sửa
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => { deleteMutation.reset(); setDialog({ type: "delete", status }); }} disabled={status.profileCount > 0} aria-label={`Xóa trạng thái ${status.name}`}>
                            <Trash2 aria-hidden="true" />
                            Xóa
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {pagination && pagination.total > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row">
            <p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={state.page <= 1 || listQuery.isFetching} onClick={() => dispatch({ type: "setPage", page: Math.max(1, state.page - 1) })}><ChevronLeft aria-hidden="true" />Trang trước</Button>
              <Button type="button" variant="outline" size="sm" disabled={state.page >= pagination.totalPages || listQuery.isFetching} onClick={() => dispatch({ type: "setPage", page: state.page + 1 })}>Trang sau<ChevronRight aria-hidden="true" /></Button>
            </div>
          </div>
        )}
      </Card>
      <StatusFlowPanel
        data={flowQuery.data}
        canManage={canManage}
        isLoading={flowQuery.isLoading}
        isSaving={flowMutation.isPending}
        error={flowMutation.error}
        onSave={(fromStatusId, toStatusIds) => flowMutation.mutate({ fromStatusId, toStatusIds })}
      />
      <StatusFormDialog
        key={dialog?.type === "edit" ? dialog.status.id : dialog?.type ?? "closed"}
        dialog={dialog}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        error={createMutation.error ?? updateMutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(input) => {
          if (dialog?.type === "edit") {
            updateMutation.mutate({ id: dialog.status.id, input });
            return;
          }
          createMutation.mutate(input);
        }}
      />
      <DeleteStatusDialog
        dialog={dialog}
        isSubmitting={deleteMutation.isPending}
        error={deleteMutation.error}
        onClose={() => setDialog(null)}
        onConfirm={() => dialog?.type === "delete" && deleteMutation.mutate(dialog.status.id)}
      />
    </div>
  );
}

function SortableHead(props: {
  label: string;
  sortBy: AdmissionStatusSortField;
  state: State;
  onSort: (sortBy: AdmissionStatusSortField) => void;
}) {
  const { label, sortBy, state, onSort } = props;
  return (
    <TableHead className="px-5 font-medium text-muted-foreground">
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onSort(sortBy)}>
        {label}
        {state.sortBy === sortBy ? (state.sortOrder === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />) : <ArrowUpDown aria-hidden="true" />}
      </button>
    </TableHead>
  );
}

function ColorBadge({ status }: { status: AdmissionStatusItem }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-3 rounded-full border" style={{ backgroundColor: status.color ?? "#94A3B8" }} aria-hidden="true" />
      <Badge variant="secondary">{status.color ?? "Mặc định"}</Badge>
    </span>
  );
}

function StatusFlowPanel(props: {
  data?: AdmissionStatusFlowResponse;
  canManage: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: unknown;
  onSave: (fromStatusId: string, toStatusIds: string[]) => void;
}) {
  const statuses = props.data?.statuses ?? [];
  const [fromStatusId, setFromStatusId] = useState("");
  const selectedFromStatusId = fromStatusId || statuses[0]?.id || "";
  const configuredNextIds = props.data?.flow[selectedFromStatusId] ?? [];

  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Luồng xử lý hồ sơ</CardTitle>
        <CardDescription>Cấu hình các trạng thái được phép chuyển tiếp từ một trạng thái hiện tại.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        {props.isLoading ? (
          <TableLoadingState label="Đang tải luồng xử lý" />
        ) : statuses.length === 0 ? (
          <EmptyState title="Chưa có trạng thái để cấu hình" description="Thêm trạng thái hồ sơ trước khi cấu hình luồng xử lý." />
        ) : (
          <>
            <Field className="max-w-md">
              <FieldLabel htmlFor="status-flow-from">Trạng thái hiện tại</FieldLabel>
              <Select value={selectedFromStatusId} onValueChange={setFromStatusId}>
                <SelectTrigger id="status-flow-from" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map((status) => <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <StatusFlowEditor
              key={`${selectedFromStatusId}:${configuredNextIds.join("|")}`}
              statuses={statuses}
              fromStatusId={selectedFromStatusId}
              initialToStatusIds={configuredNextIds}
              canManage={props.canManage}
              isSaving={props.isSaving}
              error={props.error}
              onSave={props.onSave}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusFlowEditor(props: {
  statuses: AdmissionStatusFlowResponse["statuses"];
  fromStatusId: string;
  initialToStatusIds: string[];
  canManage: boolean;
  isSaving: boolean;
  error: unknown;
  onSave: (fromStatusId: string, toStatusIds: string[]) => void;
}) {
  const [draftIds, setDraftIds] = useState(props.initialToStatusIds);
  const nextStatuses = props.statuses.reduce<AdmissionStatusFlowResponse["statuses"]>((items, status) => {
    if (status.id !== props.fromStatusId) items.push(status);
    return items;
  }, []);

  function toggleStatus(statusId: string, checked: boolean) {
    setDraftIds((current) => checked ? Array.from(new Set([...current, statusId])) : current.filter((id) => id !== statusId));
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {nextStatuses.map((status) => (
          <label key={status.id} className="flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-sm">
            <Checkbox checked={draftIds.includes(status.id)} disabled={!props.canManage} onCheckedChange={(value) => toggleStatus(status.id, value === true)} aria-label={`Cho phép chuyển sang ${status.name}`} />
            <span className="flex flex-col">
              <span className="font-medium">{status.name}</span>
              <span className="text-xs text-muted-foreground">{status.code}</span>
            </span>
          </label>
        ))}
      </div>
      {props.error && <p className="text-sm text-destructive">{getErrorMessage(props.error)}</p>}
      {props.canManage && (
        <Button type="button" disabled={props.isSaving || !props.fromStatusId} onClick={() => props.onSave(props.fromStatusId, draftIds)}>
          {props.isSaving ? "Đang lưu..." : "Lưu luồng xử lý"}
        </Button>
      )}
    </>
  );
}

function StatusFormDialog(props: {
  dialog: DialogState;
  isSubmitting: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (input: AdmissionStatusInput) => void;
}) {
  const status = props.dialog?.type === "edit" ? props.dialog.status : null;
  const [form, setForm] = useState<AdmissionStatusInput>({
    name: status?.name ?? "",
    code: status?.code ?? "",
    color: status?.color ?? "#2563EB",
  });
  const setValue = (field: keyof AdmissionStatusInput, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <Dialog open={props.dialog?.type === "create" || props.dialog?.type === "edit"} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{status ? "Chỉnh sửa trạng thái" : "Thêm trạng thái"}</DialogTitle>
          <DialogDescription>Khai báo tên, mã và màu hiển thị cho trạng thái hồ sơ tuyển sinh.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); props.onSubmit(form); }} className="space-y-4">
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="status-name">Tên trạng thái</FieldLabel>
              <Input id="status-name" value={form.name} onChange={(event) => setValue("name", event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="status-code">Mã</FieldLabel>
              <Input id="status-code" value={form.code} onChange={(event) => setValue("code", event.target.value)} placeholder="APPROVED" />
            </Field>
            <Field>
              <FieldLabel htmlFor="status-color">Màu</FieldLabel>
              <Input id="status-color" type="color" value={form.color ?? "#2563EB"} onChange={(event) => setValue("color", event.target.value)} />
            </Field>
          </FieldGroup>
          {props.error && <p className="text-sm text-destructive">{getErrorMessage(props.error)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={props.isSubmitting || !form.name.trim() || !form.code.trim()}>
              {props.isSubmitting ? "Đang lưu..." : "Lưu trạng thái"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteStatusDialog(props: {
  dialog: DialogState;
  isSubmitting: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const status = props.dialog?.type === "delete" ? props.dialog.status : null;
  return (
    <Dialog open={props.dialog?.type === "delete"} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa trạng thái</DialogTitle>
          <DialogDescription>{status ? `Bạn có chắc muốn xóa trạng thái "${status.name}" khỏi luồng xử lý hồ sơ?` : ""}</DialogDescription>
        </DialogHeader>
        {props.error && <p className="text-sm text-destructive">{getErrorMessage(props.error)}</p>}
        <DialogFooter showCloseButton>
          <Button type="button" variant="destructive" disabled={props.isSubmitting} onClick={props.onConfirm}>
            {props.isSubmitting ? "Đang xóa..." : "Xóa trạng thái"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
