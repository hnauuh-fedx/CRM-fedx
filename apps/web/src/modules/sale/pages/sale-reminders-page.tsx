import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type Header,
  type SortingState,
  type Table as DataTable,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

import { EmptyState } from "@/components/shared/data-states";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { TableLoadingState } from "@/components/shared/table-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { getSaleFilterOptions, getSaleReminders } from "@/services/sale.service";
import { CompleteReminderButton } from "../components/complete-reminder-button";
import { ReminderDialog } from "../components/reminder-dialog";
import type { ReminderFilters, ReminderItem, ReminderListResponse, SaleFilterOptions } from "../sale.types";

const pageSize = 20;
const emptyFilters: ReminderFilters = { search: "", status: "", userId: "" };
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const statusLabels: Record<string, string> = { pending: "Chờ xử lý", done: "Hoàn tất", cancelled: "Đã hủy" };

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "-";
}

function displayStatus(status: string | null) {
  return status ? (statusLabels[status] ?? status) : "Chưa xác định";
}

export function SaleRemindersPage() {
  const auth = useAuth();
  const canCreate = auth.can("reminder.create");
  const canUpdate = auth.can("reminder.update");
  const canComplete = auth.can("reminder.complete");
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "remindAt", desc: true }]);
  const sortOrder = (sorting[0]?.desc ?? true) ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["sale", "reminders", page, pageSize, sortOrder, filters],
    queryFn: () => getSaleReminders({ page, limit: pageSize, sortOrder, ...filters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["sale", "options"],
    queryFn: () => getSaleFilterOptions(auth.accessToken!),
  });
  const data = listQuery.data?.data ?? [];
  const table = useReactTable({
    data,
    columns: useColumns(canUpdate, canComplete, optionsQuery.data, auth.accessToken!),
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length ? [{ id: "remindAt", desc: next[0].desc }] : [{ id: "remindAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Sale"
        title="Nhắc việc"
        scopeLabel="Theo phạm vi truy cập"
        description="Theo dõi nhắc việc sale theo trạng thái, người phụ trách và thời hạn."
        actions={canCreate ? <ReminderDialog leads={optionsQuery.data?.leads ?? []} accessToken={auth.accessToken!} /> : undefined}
      />
      <Filters
        filters={draftFilters}
        options={optionsQuery.data}
        onChange={(field, value) => setDraftFilters((current) => ({ ...current, [field]: value }))}
        onApply={() => { setFilters(draftFilters); setPage(1); }}
        onReset={() => { setDraftFilters(emptyFilters); setFilters(emptyFilters); setPage(1); }}
      />
      <Results
        table={table}
        data={data}
        pagination={listQuery.data?.pagination}
        page={page}
        isLoading={listQuery.isLoading}
        isError={listQuery.isError}
        isFetching={listQuery.isFetching}
        onReload={() => listQuery.refetch()}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />
    </div>
  );
}

function useColumns(canUpdate: boolean, canComplete: boolean, options: SaleFilterOptions | undefined, accessToken: string) {
  return useMemo<ColumnDef<ReminderItem>[]>(
    () => [
      { accessorKey: "title", header: "Nhắc việc", cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
      { id: "lead", header: "Lead", enableSorting: false, cell: ({ row }) => row.original.lead ? `${row.original.lead.fullName} (${row.original.lead.leadCode ?? "chưa có mã"})` : "-" },
      { id: "owner", header: "Người phụ trách", enableSorting: false, cell: ({ row }) => row.original.owner?.fullName ?? "-" },
      { accessorKey: "status", header: "Trạng thái", enableSorting: false, cell: ({ row }) => <Badge variant="secondary">{displayStatus(row.original.status)}</Badge> },
      { accessorKey: "remindAt", header: "Thời hạn", cell: ({ row }) => formatDateTime(row.original.remindAt) },
      {
        id: "actions",
        header: "Thao tác",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            {canUpdate && <ReminderDialog reminder={row.original} leads={options?.leads ?? []} accessToken={accessToken} />}
            {canComplete && row.original.status !== "done" && <CompleteReminderButton reminderId={row.original.id} accessToken={accessToken} />}
          </div>
        ),
      },
    ],
    [accessToken, canComplete, canUpdate, options?.leads],
  );
}

function Filters({ filters, options, onChange, onApply, onReset }: {
  filters: ReminderFilters;
  options?: SaleFilterOptions;
  onChange: (field: keyof ReminderFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc nhắc việc</CardTitle>
        <CardDescription>Tìm theo tiêu đề, lead hoặc người phụ trách.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form onSubmit={(event) => { event.preventDefault(); onApply(); }}>
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(240px,2fr)_repeat(2,minmax(180px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="reminder-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="reminder-search" className="pl-9" placeholder="Nhập tiêu đề, mã lead hoặc họ tên" value={filters.search} onChange={(event) => onChange("search", event.target.value)} />
              </div>
            </Field>
            <FilterSelect id="reminder-status" label="Trạng thái" value={filters.status} onChange={(value) => onChange("status", value)} options={(options?.reminderStatuses ?? []).map((status) => ({ value: status, label: displayStatus(status) }))} />
            <FilterSelect id="reminder-user" label="Người phụ trách" value={filters.userId} onChange={(value) => onChange("userId", value)} options={(options?.assignees ?? []).map((item) => ({ value: item.id, label: item.fullName }))} />
            <div className="flex items-end gap-2">
              <Button type="submit">Áp dụng</Button>
              <Button type="button" variant="outline" onClick={onReset}>Xóa lọc</Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function Results(props: {
  table: DataTable<ReminderItem>;
  data: ReminderItem[];
  pagination?: ReminderListResponse["pagination"];
  page: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { table, data, pagination, page, isLoading, isError, isFetching, onReload, onPrevious, onNext } = props;
  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-xs">
      <CardHeader className="gap-1 border-b py-5">
        <CardTitle>Nhắc việc sale</CardTitle>
        <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} nhắc việc` : "Đang lấy dữ liệu nhắc việc…"}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? <ErrorState title="Không thể tải nhắc việc" description="Vui lòng thử lại để cập nhật nhắc việc sale." onReload={onReload} /> : isLoading ? (
          <TableLoadingState label="Đang tải nhắc việc sale" />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có nhắc việc phù hợp với bộ lọc" description="Điều chỉnh bộ lọc để tìm nhắc việc cần theo dõi." />
        ) : <SortableTable table={table} />}
      </CardContent>
      {pagination && pagination.total > 0 && <Pager page={page} pagination={pagination} isFetching={isFetching} onPrevious={onPrevious} onNext={onNext} />}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<ReminderItem> }) {
  return <Table className="min-w-240"><caption className="sr-only">Danh sách nhắc việc sale</caption><TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">{table.getHeaderGroups().map((group) => <TableRow key={group.id} className="hover:bg-muted/55">{group.headers.map((header) => <SortHeader key={header.id} header={header} />)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="px-5 py-4">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table>;
}

function SortHeader({ header }: { header: Header<ReminderItem, unknown> }) {
  const direction = header.column.getIsSorted();
  return <TableHead scope="col" className="px-5 font-medium text-muted-foreground" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}>{header.column.getCanSort() ? <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{direction === "asc" ? <ArrowUp aria-hidden="true" /> : direction === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}</button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>;
}

function Pager({ page, pagination, isFetching, onPrevious, onNext }: { page: number; pagination: ReminderListResponse["pagination"]; isFetching: boolean; onPrevious: () => void; onNext: () => void }) {
  return <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"><p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={onPrevious}><ChevronLeft aria-hidden="true" />Trang trước</Button><Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || isFetching} onClick={onNext}>Trang sau<ChevronRight aria-hidden="true" /></Button></div></div>;
}
