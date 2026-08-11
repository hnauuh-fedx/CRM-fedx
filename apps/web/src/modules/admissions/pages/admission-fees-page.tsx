import { useReducer, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, History, ReceiptText, Search, ShieldCheck } from "lucide-react";

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
import {
  confirmAdmissionFeeDebt,
  getAdmissionFeeHistory,
  getAdmissionFeeList,
  getAdmissionFeeOptions,
  updateAdmissionFeePayment,
  type AdmissionFeeSortField,
} from "@/services/admission.service";
import type {
  AdmissionDebtConfirmationInput,
  AdmissionFeeHistoryResponse,
  AdmissionFeeItem,
  AdmissionFeePaymentInput,
} from "../admission.types";

const pageSize = 20;
const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const moneyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

type State = {
  page: number;
  search: string;
  appliedSearch: string;
  status: string;
  appliedStatus: string;
  sortBy: AdmissionFeeSortField;
  sortOrder: "asc" | "desc";
};

type Action =
  | { type: "setSearch"; value: string }
  | { type: "setStatus"; value: string }
  | { type: "applyFilters" }
  | { type: "resetFilters" }
  | { type: "setPage"; page: number }
  | { type: "toggleSort"; sortBy: AdmissionFeeSortField };

type DialogState =
  | { type: "payment"; fee: AdmissionFeeItem }
  | { type: "debt"; fee: AdmissionFeeItem }
  | { type: "history"; fee: AdmissionFeeItem }
  | null;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setSearch":
      return { ...state, search: action.value };
    case "setStatus":
      return { ...state, status: action.value };
    case "applyFilters":
      return { ...state, page: 1, appliedSearch: state.search, appliedStatus: state.status };
    case "resetFilters":
      return { ...state, page: 1, search: "", status: "", appliedSearch: "", appliedStatus: "" };
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

function formatMoney(value: string | null) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? moneyFormatter.format(numericValue) : "-";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Không thể thực hiện thao tác.";
}

function getStatusLabel(value: string | null) {
  const labels: Record<string, string> = {
    paid: "Đã thanh toán",
    pending: "Chờ thanh toán",
    partial: "Thanh toán một phần",
    overdue: "Quá hạn",
    waived: "Miễn giảm",
  };
  return value ? labels[value] ?? value : "Chưa xác định";
}

export function AdmissionFeesPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canUpdate = auth.can("admission.update");
  const [state, dispatch] = useReducer(reducer, {
    page: 1,
    search: "",
    appliedSearch: "",
    status: "",
    appliedStatus: "",
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const [dialog, setDialog] = useState<DialogState>(null);

  const listQuery = useQuery({
    queryKey: ["admissions", "fees", state.page, pageSize, state.sortBy, state.sortOrder, state.appliedSearch, state.appliedStatus],
    queryFn: () =>
      getAdmissionFeeList(
        {
          page: state.page,
          limit: pageSize,
          search: state.appliedSearch,
          sortBy: state.sortBy,
          sortOrder: state.sortOrder,
          status: state.appliedStatus,
        },
        auth.accessToken!,
      ),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["admissions", "fees", "options"],
    queryFn: () => getAdmissionFeeOptions(auth.accessToken!),
  });
  const selectedHistoryId = dialog?.type === "history" ? dialog.fee.id : "";
  const historyQuery = useQuery({
    queryKey: ["admissions", "fees", selectedHistoryId, "history"],
    queryFn: () => getAdmissionFeeHistory(selectedHistoryId, auth.accessToken!),
    enabled: Boolean(selectedHistoryId),
  });

  const invalidateFees = () => queryClient.invalidateQueries({ queryKey: ["admissions", "fees"] });
  const paymentMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdmissionFeePaymentInput }) =>
      updateAdmissionFeePayment(id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateFees();
    },
  });
  const debtMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdmissionDebtConfirmationInput }) =>
      confirmAdmissionFeeDebt(id, input, auth.accessToken!),
    onSuccess: () => {
      setDialog(null);
      invalidateFees();
    },
  });

  const fees = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;
  const statusOptions = optionsQuery.data?.statuses ?? ["pending", "partial", "paid", "overdue", "waived"];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Tuyển sinh"
        title="Phí / học phí"
        scopeLabel="Theo phạm vi truy cập"
        description="Cập nhật thanh toán, theo dõi lịch sử thu phí và xác nhận công nợ tuyển sinh."
      />
      <Card className="gap-4 border-border/70 py-5 shadow-xs">
        <CardHeader className="gap-1 px-5">
          <CardTitle>Bộ lọc phí / học phí</CardTitle>
          <CardDescription>Tìm theo mã hồ sơ, thí sinh hoặc trạng thái thanh toán.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form onSubmit={(event) => { event.preventDefault(); dispatch({ type: "applyFilters" }); }}>
            <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(260px,2fr)_minmax(180px,1fr)_auto]">
              <Field className="gap-2">
                <FieldLabel htmlFor="admission-fee-search">Tìm kiếm</FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="admission-fee-search" className="pl-9" placeholder="Nhập mã hồ sơ hoặc thí sinh" value={state.search} onChange={(event) => dispatch({ type: "setSearch", value: event.target.value })} />
                </div>
              </Field>
              <FilterSelect id="admission-fee-status" label="Trạng thái" value={state.status} onChange={(value) => dispatch({ type: "setStatus", value })} options={statusOptions.map((status) => ({ value: status, label: getStatusLabel(status) }))} />
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
          <CardTitle>Phí / học phí</CardTitle>
          <CardDescription>{pagination ? `Hiển thị ${fees.length} trong tổng số ${pagination.total} hồ sơ phí` : "Đang lấy dữ liệu phí..."}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {listQuery.isError ? (
            <ErrorState title="Không thể tải danh sách phí" description="Vui lòng thử lại để cập nhật danh sách phí / học phí." onReload={() => listQuery.refetch()} />
          ) : listQuery.isLoading ? (
            <TableLoadingState label="Đang tải danh sách phí" />
          ) : fees.length === 0 ? (
            <EmptyState title="Chưa có hồ sơ phí phù hợp" description="Điều chỉnh bộ lọc để tìm hồ sơ cần theo dõi công nợ." />
          ) : (
            <Table className="min-w-260">
              <caption className="sr-only">Danh sách phí / học phí tuyển sinh</caption>
              <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
                <TableRow className="hover:bg-muted/55">
                  <SortableHead label="Mã hồ sơ" sortBy="admissionCode" state={state} onSort={(sortBy) => dispatch({ type: "toggleSort", sortBy })} />
                  <TableHead className="px-5 font-medium text-muted-foreground">Thí sinh</TableHead>
                  <TableHead className="px-5 font-medium text-muted-foreground">Ngành</TableHead>
                  <SortableHead label="Lệ phí" sortBy="feeStatus" state={state} onSort={(sortBy) => dispatch({ type: "toggleSort", sortBy })} />
                  <SortableHead label="Học phí" sortBy="tuitionStatus" state={state} onSort={(sortBy) => dispatch({ type: "toggleSort", sortBy })} />
                  <SortableHead label="Doanh thu tháng" sortBy="monthlyRevenue" state={state} onSort={(sortBy) => dispatch({ type: "toggleSort", sortBy })} />
                  <SortableHead label="Ngày tạo" sortBy="createdAt" state={state} onSort={(sortBy) => dispatch({ type: "toggleSort", sortBy })} />
                  <TableHead className="px-5 text-right font-medium text-muted-foreground">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell className="px-5 py-4 font-medium">{fee.admissionCode ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4">{fee.candidateName ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4">{fee.majorName ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4"><PaymentStatusBadge value={fee.feeStatus} /></TableCell>
                    <TableCell className="px-5 py-4"><PaymentStatusBadge value={fee.tuitionStatus} /></TableCell>
                    <TableCell className="px-5 py-4">{formatMoney(fee.monthlyRevenue)}</TableCell>
                    <TableCell className="px-5 py-4">{formatDate(fee.createdAt)}</TableCell>
                    <TableCell className="px-5 py-4">
                      <div className="flex min-w-72 flex-wrap justify-end gap-2">
                        {canUpdate && (
                          <>
                            <Button type="button" size="sm" variant="outline" onClick={() => { paymentMutation.reset(); setDialog({ type: "payment", fee }); }}>
                              <ReceiptText aria-hidden="true" />
                              Thanh toán
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => { debtMutation.reset(); setDialog({ type: "debt", fee }); }}>
                              <ShieldCheck aria-hidden="true" />
                              Công nợ
                            </Button>
                          </>
                        )}
                        <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ type: "history", fee })}>
                          <History aria-hidden="true" />
                          Lịch sử
                        </Button>
                      </div>
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
      <PaymentDialog
        dialog={dialog}
        isSubmitting={paymentMutation.isPending}
        error={paymentMutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(input) => dialog?.type === "payment" && paymentMutation.mutate({ id: dialog.fee.id, input })}
      />
      <DebtDialog
        dialog={dialog}
        isSubmitting={debtMutation.isPending}
        error={debtMutation.error}
        onClose={() => setDialog(null)}
        onSubmit={(input) => dialog?.type === "debt" && debtMutation.mutate({ id: dialog.fee.id, input })}
      />
      <HistoryDialog dialog={dialog} queryData={historyQuery.data} isLoading={historyQuery.isLoading} isError={historyQuery.isError} onClose={() => setDialog(null)} />
    </div>
  );
}

function SortableHead(props: { label: string; sortBy: AdmissionFeeSortField; state: State; onSort: (sortBy: AdmissionFeeSortField) => void }) {
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

function PaymentStatusBadge({ value }: { value: string | null }) {
  const variant = value === "paid" ? "default" : value === "overdue" ? "destructive" : "secondary";
  return <Badge variant={variant}>{getStatusLabel(value)}</Badge>;
}

function PaymentDialog(props: {
  dialog: DialogState;
  isSubmitting: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (input: AdmissionFeePaymentInput) => void;
}) {
  const fee = props.dialog?.type === "payment" ? props.dialog.fee : null;
  const [form, setForm] = useState<AdmissionFeePaymentInput>({
    feeStatus: fee?.feeStatus ?? "pending",
    tuitionStatus: fee?.tuitionStatus ?? "pending",
    monthlyRevenue: fee?.monthlyRevenue ?? "",
    paymentAmount: "",
    paymentMethod: "",
    paidAt: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const setValue = (field: keyof AdmissionFeePaymentInput, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <Dialog open={props.dialog?.type === "payment"} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cập nhật thanh toán</DialogTitle>
          <DialogDescription>{fee ? `Hồ sơ ${fee.admissionCode ?? ""} - ${fee.candidateName ?? ""}` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); props.onSubmit(form); }} className="space-y-5">
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <StatusSelect id="fee-status" label="Trạng thái lệ phí" value={form.feeStatus ?? ""} onChange={(value) => setValue("feeStatus", value)} />
            <StatusSelect id="tuition-status" label="Trạng thái học phí" value={form.tuitionStatus ?? ""} onChange={(value) => setValue("tuitionStatus", value)} />
            <TextInput id="monthly-revenue" label="Doanh thu tháng" value={form.monthlyRevenue ?? ""} onChange={(value) => setValue("monthlyRevenue", value)} />
            <TextInput id="payment-amount" label="Số tiền thu" value={form.paymentAmount ?? ""} onChange={(value) => setValue("paymentAmount", value)} />
            <TextInput id="payment-method" label="Phương thức" value={form.paymentMethod ?? ""} onChange={(value) => setValue("paymentMethod", value)} placeholder="Tiền mặt, chuyển khoản..." />
            <TextInput id="paid-at" type="date" label="Ngày thu" value={form.paidAt ?? ""} onChange={(value) => setValue("paidAt", value)} />
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="payment-note">Ghi chú</FieldLabel>
              <Textarea id="payment-note" rows={3} value={form.note ?? ""} onChange={(event) => setValue("note", event.target.value)} placeholder="Nội dung thu phí, mã giao dịch hoặc ghi chú kế toán..." />
            </Field>
          </FieldGroup>
          {props.error && <p className="text-sm text-destructive">{getErrorMessage(props.error)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={props.isSubmitting}>{props.isSubmitting ? "Đang lưu..." : "Lưu thanh toán"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DebtDialog(props: {
  dialog: DialogState;
  isSubmitting: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (input: AdmissionDebtConfirmationInput) => void;
}) {
  const fee = props.dialog?.type === "debt" ? props.dialog.fee : null;
  const [debtStatus, setDebtStatus] = useState<AdmissionDebtConfirmationInput["debtStatus"]>("confirmed");
  const [note, setNote] = useState("");
  return (
    <Dialog open={props.dialog?.type === "debt"} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận công nợ</DialogTitle>
          <DialogDescription>{fee ? `Ghi nhận công nợ cho hồ sơ ${fee.admissionCode ?? ""} - ${fee.candidateName ?? ""}.` : ""}</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="debt-status">Tình trạng công nợ</FieldLabel>
            <Select value={debtStatus} onValueChange={(value) => setDebtStatus(value as AdmissionDebtConfirmationInput["debtStatus"])}>
              <SelectTrigger id="debt-status" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Đã xác nhận</SelectItem>
                <SelectItem value="pending">Chờ đối soát</SelectItem>
                <SelectItem value="disputed">Cần kiểm tra</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="debt-note">Ghi chú công nợ</FieldLabel>
            <Textarea id="debt-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú đối soát, số tiền còn phải thu hoặc lý do chênh lệch..." />
          </Field>
        </FieldGroup>
        {props.error && <p className="text-sm text-destructive">{getErrorMessage(props.error)}</p>}
        <DialogFooter>
          <Button type="button" disabled={props.isSubmitting} onClick={() => props.onSubmit({ debtStatus, note })}>{props.isSubmitting ? "Đang xác nhận..." : "Xác nhận công nợ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog(props: {
  dialog: DialogState;
  queryData?: AdmissionFeeHistoryResponse;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={props.dialog?.type === "history"} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lịch sử thu phí</DialogTitle>
          <DialogDescription>{props.queryData?.profile ? `${props.queryData.profile.admissionCode ?? ""} - ${props.queryData.profile.candidateName ?? ""}` : "Các lần cập nhật thanh toán và xác nhận công nợ."}</DialogDescription>
        </DialogHeader>
        {props.isError ? (
          <ErrorState title="Không thể tải lịch sử thu phí" description="Vui lòng đóng và mở lại lịch sử để thử lại." />
        ) : props.isLoading ? (
          <TableLoadingState label="Đang tải lịch sử thu phí" />
        ) : !props.queryData || props.queryData.data.length === 0 ? (
          <EmptyState title="Chưa có lịch sử thu phí" description="Các cập nhật thanh toán và xác nhận công nợ sẽ hiển thị tại đây." />
        ) : (
          <div className="space-y-3">
            {props.queryData.data.map((item) => (
              <div key={item.id} className="rounded-md border p-4">
                <div className="flex flex-col justify-between gap-1 sm:flex-row">
                  <p className="font-medium">{item.action === "payment_updated" ? "Cập nhật thanh toán" : "Xác nhận công nợ"}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(item.createdAt)}</p>
                </div>
                <p className="text-sm text-muted-foreground">Người thao tác: {item.actorName ?? "-"}</p>
                <pre className="mt-3 max-h-40 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(item.newData, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusSelect(props: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger id={props.id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Chờ thanh toán</SelectItem>
          <SelectItem value="partial">Thanh toán một phần</SelectItem>
          <SelectItem value="paid">Đã thanh toán</SelectItem>
          <SelectItem value="overdue">Quá hạn</SelectItem>
          <SelectItem value="waived">Miễn giảm</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

function TextInput(props: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input id={props.id} type={props.type ?? "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} />
    </Field>
  );
}
