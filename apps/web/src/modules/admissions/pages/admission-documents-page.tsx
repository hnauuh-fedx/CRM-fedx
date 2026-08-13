import { useMemo, useReducer, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, FileUp, Search, XCircle } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import { RuntimeCustomFieldsSection } from "@/modules/custom-fields/runtime-custom-fields-section";
import {
  getAdmissionDocumentActionOptions,
  getAdmissionDocumentList,
  getAdmissionDocumentOptions,
  updateAdmissionDocumentStatus,
  uploadAdmissionDocument,
  type AdmissionDocumentSortField,
} from "@/services/admission.service";
import type {
  AdmissionDocumentActionOptions,
  AdmissionDocumentInput,
  AdmissionDocumentItem,
  AdmissionDocumentStatus,
} from "../admission.types";

const pageSize = 20;
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

type State = {
  page: number;
  search: string;
  appliedSearch: string;
  status: string;
  type: string;
  appliedStatus: string;
  appliedType: string;
  sortBy: AdmissionDocumentSortField;
  sortOrder: "asc" | "desc";
};

type Action =
  | { type: "setSearch"; value: string }
  | { type: "setStatus"; value: string }
  | { type: "setType"; value: string }
  | { type: "applyFilters" }
  | { type: "resetFilters" }
  | { type: "setPage"; page: number }
  | { type: "toggleSort"; sortBy: AdmissionDocumentSortField };

type DialogState =
  | { type: "upload" }
  | { type: "status"; document: AdmissionDocumentItem; status: AdmissionDocumentStatus }
  | null;

const statusLabels: Record<AdmissionDocumentStatus, string> = {
  approved: "Đã duyệt",
  missing: "Thiếu",
  pending: "Chờ duyệt",
  rejected: "Từ chối",
  supplement_requested: "Cần bổ sung",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setSearch":
      return { ...state, search: action.value };
    case "setStatus":
      return { ...state, status: action.value };
    case "setType":
      return { ...state, type: action.value };
    case "applyFilters":
      return { ...state, page: 1, appliedSearch: state.search, appliedStatus: state.status, appliedType: state.type };
    case "resetFilters":
      return { ...state, page: 1, search: "", status: "", type: "", appliedSearch: "", appliedStatus: "", appliedType: "" };
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

function normalizeStatus(value: string | null): AdmissionDocumentStatus {
  if (value === "approved" || value === "rejected" || value === "missing" || value === "supplement_requested") {
    return value;
  }
  return "pending";
}

export function AdmissionDocumentsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, {
    page: 1,
    search: "",
    appliedSearch: "",
    status: "",
    type: "",
    appliedStatus: "",
    appliedType: "",
    sortBy: "uploadedAt",
    sortOrder: "desc",
  });
  const [dialog, setDialog] = useState<DialogState>(null);
  const canUpload = auth.can("admission_document.upload");
  const canApprove = auth.can("admission.approve");

  const listQuery = useQuery({
    queryKey: [
      "admissions",
      "documents",
      state.page,
      pageSize,
      state.sortBy,
      state.sortOrder,
      state.appliedSearch,
      state.appliedStatus,
      state.appliedType,
    ],
    queryFn: () =>
      getAdmissionDocumentList(
        {
          page: state.page,
          limit: pageSize,
          search: state.appliedSearch,
          sortBy: state.sortBy,
          sortOrder: state.sortOrder,
          status: state.appliedStatus,
          type: state.appliedType,
        },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["admissions", "documents", "options"],
    queryFn: () => getAdmissionDocumentOptions(auth.accessToken!),
  });
  const actionOptionsQuery = useQuery({
    queryKey: ["admissions", "documents", "action-options"],
    queryFn: () => getAdmissionDocumentActionOptions(auth.accessToken!),
    enabled: canUpload || canApprove,
  });

  const invalidateDocuments = () => queryClient.invalidateQueries({ queryKey: ["admissions", "documents"] });
  const uploadMutation = useMutation({
    mutationFn: (input: AdmissionDocumentInput) => uploadAdmissionDocument(input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateDocuments();
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: AdmissionDocumentStatus; note?: string }) =>
      updateAdmissionDocumentStatus(id, status, note, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateDocuments();
    },
  });

  const documents = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;
  const typeOptions = optionsQuery.data?.types ?? [];
  const statusOptions = (optionsQuery.data?.statuses ?? ["pending", "approved", "rejected", "missing", "supplement_requested"]);
  const columns = useMemo(
    () => [
      { key: "admissionCode", label: "Mã hồ sơ" },
      { key: "candidateName", label: "Thí sinh" },
      { key: "documentType", label: "Loại tài liệu", sortable: "documentType" as const },
      { key: "status", label: "Trạng thái", sortable: "status" as const },
      { key: "fileName", label: "Tệp đính kèm" },
      { key: "uploadedAt", label: "Ngày tải lên", sortable: "uploadedAt" as const },
    ],
    [],
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Tuyển sinh"
        title="Tài liệu hồ sơ"
        scopeLabel="Theo phạm vi truy cập"
        description="Upload, duyệt và theo dõi tình trạng bổ sung tài liệu cho hồ sơ tuyển sinh."
        actions={
          canUpload ? (
            <Button type="button" onClick={() => { uploadMutation.reset(); setDialog({ type: "upload" }); }}>
              <FileUp aria-hidden="true" />
              Upload tài liệu
            </Button>
          ) : undefined
        }
      />
      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle>Bộ lọc tài liệu</CardTitle>
          <CardDescription>Tìm theo mã hồ sơ, thí sinh hoặc loại tài liệu.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form onSubmit={(event) => { event.preventDefault(); dispatch({ type: "applyFilters" }); }}>
            <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(240px,2fr)_repeat(2,minmax(180px,1fr))_auto]">
              <Field className="gap-2">
                <FieldLabel htmlFor="admission-document-search">Tìm kiếm</FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="admission-document-search" className="pl-9" placeholder="Nhập mã hồ sơ, thí sinh hoặc loại tài liệu" value={state.search} onChange={(event) => dispatch({ type: "setSearch", value: event.target.value })} />
                </div>
              </Field>
              <FilterSelect id="admission-document-status" label="Trạng thái" value={state.status} onChange={(value) => dispatch({ type: "setStatus", value })} options={statusOptions.map((status) => ({ value: status, label: statusLabels[normalizeStatus(status)] ?? status }))} />
              <FilterSelect id="admission-document-type" label="Loại tài liệu" value={state.type} onChange={(value) => dispatch({ type: "setType", value })} options={typeOptions.map((type) => ({ value: type, label: type }))} />
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
          <CardTitle>Tài liệu hồ sơ</CardTitle>
          <CardDescription>{pagination ? `Hiển thị ${documents.length} trong tổng số ${pagination.total} tài liệu` : "Đang lấy dữ liệu tài liệu..."}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải danh sách tài liệu" description="Vui lòng thử lại để cập nhật danh sách tài liệu hồ sơ." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách tài liệu" />
          ) : documents.length === 0 ? (
            <EmptyState title="Chưa có tài liệu phù hợp" description="Điều chỉnh bộ lọc hoặc upload tài liệu mới cho hồ sơ tuyển sinh." />
          ) : (
            <Table className="min-w-240">
              <caption className="sr-only">Danh sách tài liệu hồ sơ tuyển sinh</caption>
              <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
                <TableRow className="hover:bg-muted/55">
                  {columns.map((column) => (
                    <TableHead key={column.key} scope="col" className="px-5 font-medium text-muted-foreground">
                      {column.sortable ? (
                        <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={() => dispatch({ type: "toggleSort", sortBy: column.sortable })}>
                          {column.label}
                          {state.sortBy === column.sortable ? (state.sortOrder === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />) : <ArrowUpDown aria-hidden="true" />}
                        </button>
                      ) : column.label}
                    </TableHead>
                  ))}
                  <TableHead scope="col" className="px-5 text-right font-medium text-muted-foreground">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="px-5 py-4">{document.admissionCode ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4 font-medium">{document.candidateName ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4">{document.documentType}</TableCell>
                    <TableCell className="px-5 py-4"><DocumentStatusBadge status={document.status} /></TableCell>
                    <TableCell className="px-5 py-4">{document.fileUrl ? <a className="text-primary underline-offset-4 hover:underline" href={document.fileUrl} target="_blank" rel="noreferrer">{document.fileName ?? "Mở tệp"}</a> : document.fileName ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4">{formatDate(document.uploadedAt)}</TableCell>
                    <TableCell className="px-5 py-4">
                      <DocumentActions
                        document={document}
                        canApprove={canApprove}
                        canUpload={canUpload}
                        onAction={(status) => {
                          statusMutation.reset();
                          setDialog({ type: "status", document, status });
                        }}
                      />
                    </TableCell>
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
      <UploadDocumentDialog
        open={dialog?.type === "upload"}
        options={actionOptionsQuery.data}
        isSubmitting={uploadMutation.isPending}
        error={uploadMutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(input) => uploadMutation.mutate(input)}
      />
      <DocumentStatusDialog
        dialog={dialog}
        isSubmitting={statusMutation.isPending}
        error={statusMutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(note) => dialog?.type === "status" && statusMutation.mutate({ id: dialog.document.id, status: dialog.status, note })}
      />
    </div>
  );
}

function DocumentStatusBadge({ status }: { status: string | null }) {
  const normalized = normalizeStatus(status);
  const variant = normalized === "approved" ? "default" : normalized === "rejected" || normalized === "missing" ? "destructive" : "secondary";
  return <Badge variant={variant}>{statusLabels[normalized]}</Badge>;
}

function DocumentActions(props: {
  document: AdmissionDocumentItem;
  canApprove: boolean;
  canUpload: boolean;
  onAction: (status: AdmissionDocumentStatus) => void;
}) {
  const { document, canApprove, canUpload, onAction } = props;
  return (
    <div className="flex min-w-64 flex-wrap justify-end gap-2">
      {canApprove && (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => onAction("approved")} disabled={document.status === "approved"}>
            <CheckCircle2 aria-hidden="true" />
            Duyệt
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onAction("rejected")} disabled={document.status === "rejected"}>
            <XCircle aria-hidden="true" />
            Từ chối
          </Button>
        </>
      )}
      {canUpload && (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => onAction("missing")} disabled={document.status === "missing"}>Thiếu</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onAction("supplement_requested")} disabled={document.status === "supplement_requested"}>Bổ sung</Button>
        </>
      )}
    </div>
  );
}

function UploadDocumentDialog(props: {
  open: boolean;
  options?: AdmissionDocumentActionOptions;
  isSubmitting: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (input: AdmissionDocumentInput) => void;
}) {
  const [form, setForm] = useState<AdmissionDocumentInput>({ leadId: "", documentType: "", fileName: "", fileUrl: "", mimeType: "", fileSize: undefined, customFieldValues: {} });
  const setValue = (field: keyof AdmissionDocumentInput, value: string) => {
    setForm((current) => ({ ...current, [field]: field === "fileSize" ? (value ? Number(value) : undefined) : value }));
  };

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload tài liệu hồ sơ</DialogTitle>
          <DialogDescription>Khai báo tài liệu theo hồ sơ tuyển sinh và lưu metadata tệp đính kèm.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); props.onSubmit(form); }} className="space-y-5">
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="document-profile">Hồ sơ tuyển sinh</FieldLabel>
              <Select value={form.leadId} onValueChange={(value) => setValue("leadId", value)}>
                <SelectTrigger id="document-profile" className="w-full"><SelectValue placeholder="Chọn hồ sơ" /></SelectTrigger>
                <SelectContent>{(props.options?.profiles ?? []).map((profile) => <SelectItem key={profile.leadId} value={profile.leadId}>{profile.admissionCode ?? profile.leadCode ?? "Chưa có mã"} - {profile.candidateName}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="document-type">Loại tài liệu</FieldLabel>
              <Input id="document-type" value={form.documentType} onChange={(event) => setValue("documentType", event.target.value)} placeholder="Ví dụ: Học bạ THPT" />
            </Field>
            <Field>
              <FieldLabel htmlFor="document-file-name">Tên tệp</FieldLabel>
              <Input id="document-file-name" value={form.fileName ?? ""} onChange={(event) => setValue("fileName", event.target.value)} placeholder="hoc-ba-thpt.pdf" />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="document-file-url">Đường dẫn tệp</FieldLabel>
              <Input id="document-file-url" value={form.fileUrl ?? ""} onChange={(event) => setValue("fileUrl", event.target.value)} placeholder="https://storage.example.test/admissions/hoc-ba.pdf" />
            </Field>
            <Field>
              <FieldLabel htmlFor="document-mime">Định dạng</FieldLabel>
              <Input id="document-mime" value={form.mimeType ?? ""} onChange={(event) => setValue("mimeType", event.target.value)} placeholder="application/pdf" />
            </Field>
            <Field>
              <FieldLabel htmlFor="document-size">Dung lượng byte</FieldLabel>
              <Input id="document-size" type="number" min={1} value={form.fileSize ?? ""} onChange={(event) => setValue("fileSize", event.target.value)} />
            </Field>
          </FieldGroup>
          <RuntimeCustomFieldsSection entityType="ADMISSION_DOCUMENT" disabled={props.isSubmitting} onChange={(values) => setForm((current) => ({ ...current, customFieldValues: values }))} />
          {props.error && <p className="text-sm text-destructive">{getErrorMessage(props.error)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={props.isSubmitting || !form.leadId || !form.documentType.trim()}>{props.isSubmitting ? "Đang lưu..." : "Lưu tài liệu"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentStatusDialog(props: {
  dialog: DialogState;
  isSubmitting: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (note?: string) => void;
}) {
  const [note, setNote] = useState("");
  const document = props.dialog?.type === "status" ? props.dialog.document : null;
  const status = props.dialog?.type === "status" ? props.dialog.status : null;
  return (
    <Dialog open={props.dialog?.type === "status"} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cập nhật tài liệu hồ sơ</DialogTitle>
          <DialogDescription>{document && status ? `${document.documentType} sẽ chuyển sang trạng thái "${statusLabels[status]}".` : ""}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="document-status-note">Ghi chú xử lý</FieldLabel>
          <Textarea id="document-status-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nhập lý do từ chối, nội dung thiếu hoặc yêu cầu bổ sung..." />
        </Field>
        {props.error && <p className="text-sm text-destructive">{getErrorMessage(props.error)}</p>}
        <DialogFooter>
          <Button type="button" disabled={props.isSubmitting} onClick={() => props.onSubmit(note)}>
            {props.isSubmitting ? "Đang cập nhật..." : "Cập nhật"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
