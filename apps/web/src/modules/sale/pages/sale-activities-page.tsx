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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/modules/auth/auth-context";
import { getLeadActivities, getSaleFilterOptions } from "@/services/sale.service";
import { ActivityDialog } from "../components/activity-dialog";
import type { ActivityFilters, ActivityItem, ActivityListResponse, SaleFilterOptions } from "../sale.types";

const pageSize = 20;
const emptyFilters: ActivityFilters = { search: "", type: "", userId: "" };
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "-";
}

export function SaleActivitiesPage() {
  const auth = useAuth();
  const canCreate = auth.can("lead_activity.create");
  const canUpdate = auth.can("lead_activity.update");
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const sortOrder = (sorting[0]?.desc ?? true) ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["sale", "activities", page, pageSize, sortOrder, filters],
    queryFn: () => getLeadActivities({ page, limit: pageSize, sortOrder, ...filters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["sale", "options"],
    queryFn: () => getSaleFilterOptions(auth.accessToken!),
  });
  const data = listQuery.data?.data ?? [];
  const table = useReactTable({
    data,
    columns: useColumns(canUpdate, optionsQuery.data, auth.accessToken!),
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length ? [{ id: "createdAt", desc: next[0].desc }] : [{ id: "createdAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Sale"
        title="Hoạt động"
        scopeLabel="Theo phạm vi truy cập"
        description="Theo dõi các hoạt động sale đã ghi nhận trên lead."
        actions={canCreate ? <ActivityDialog leads={optionsQuery.data?.leads ?? []} accessToken={auth.accessToken!} /> : undefined}
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

function useColumns(canUpdate: boolean, options: SaleFilterOptions | undefined, accessToken: string) {
  return useMemo<ColumnDef<ActivityItem>[]>(
    () => [
      { accessorKey: "type", header: "Loại hoạt động" },
      { id: "lead", header: "Lead", enableSorting: false, cell: ({ row }) => row.original.lead ? `${row.original.lead.fullName} (${row.original.lead.leadCode ?? "chưa có mã"})` : "-" },
      { id: "actor", header: "Người thực hiện", enableSorting: false, cell: ({ row }) => row.original.actor?.fullName ?? "Hệ thống" },
      { accessorKey: "content", header: "Nội dung", enableSorting: false, cell: ({ row }) => row.original.content ?? "-" },
      { accessorKey: "createdAt", header: "Thời điểm", cell: ({ row }) => formatDateTime(row.original.createdAt) },
      {
        id: "actions",
        header: "Thao tác",
        enableSorting: false,
        cell: ({ row }) => canUpdate && row.original.isManual
          ? <ActivityDialog activity={row.original} leads={options?.leads ?? []} accessToken={accessToken} />
          : "-",
      },
    ],
    [accessToken, canUpdate, options?.leads],
  );
}

function Filters({ filters, options, onChange, onApply, onReset }: {
  filters: ActivityFilters;
  options?: SaleFilterOptions;
  onChange: (field: keyof ActivityFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc hoạt động</CardTitle>
        <CardDescription>Tìm theo loại hoạt động, nội dung hoặc lead.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form onSubmit={(event) => { event.preventDefault(); onApply(); }}>
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(240px,2fr)_repeat(2,minmax(180px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="activity-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="activity-search" className="pl-9" placeholder="Nhập nội dung, mã lead hoặc họ tên" value={filters.search} onChange={(event) => onChange("search", event.target.value)} />
              </div>
            </Field>
            <FilterSelect id="activity-type" label="Loại hoạt động" value={filters.type} onChange={(value) => onChange("type", value)} options={(options?.activityTypes ?? []).map((type) => ({ value: type, label: type }))} />
            <FilterSelect id="activity-user" label="Người thực hiện" value={filters.userId} onChange={(value) => onChange("userId", value)} options={(options?.assignees ?? []).map((item) => ({ value: item.id, label: item.fullName }))} />
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
  table: DataTable<ActivityItem>;
  data: ActivityItem[];
  pagination?: ActivityListResponse["pagination"];
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
        <CardTitle>Hoạt động sale</CardTitle>
        <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} hoạt động` : "Đang lấy dữ liệu hoạt động…"}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? <ErrorState title="Không thể tải hoạt động sale" description="Vui lòng thử lại để cập nhật dữ liệu hoạt động." onReload={onReload} /> : isLoading ? (
          <TableLoadingState label="Đang tải hoạt động sale" />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có hoạt động phù hợp với bộ lọc" description="Điều chỉnh bộ lọc để tìm hoạt động cần kiểm tra." />
        ) : <SortableTable table={table} />}
      </CardContent>
      {pagination && pagination.total > 0 && <Pager page={page} pagination={pagination} isFetching={isFetching} onPrevious={onPrevious} onNext={onNext} />}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<ActivityItem> }) {
  return <Table className="min-w-260"><caption className="sr-only">Danh sách hoạt động sale</caption><TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">{table.getHeaderGroups().map((group) => <TableRow key={group.id} className="hover:bg-muted/55">{group.headers.map((header) => <SortHeader key={header.id} header={header} />)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="px-5 py-4">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table>;
}

function SortHeader({ header }: { header: Header<ActivityItem, unknown> }) {
  const direction = header.column.getIsSorted();
  return <TableHead scope="col" className="px-5 font-medium text-muted-foreground" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}>{header.column.getCanSort() ? <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{direction === "asc" ? <ArrowUp aria-hidden="true" /> : direction === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}</button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>;
}

function Pager({ page, pagination, isFetching, onPrevious, onNext }: { page: number; pagination: ActivityListResponse["pagination"]; isFetching: boolean; onPrevious: () => void; onNext: () => void }) {
  return <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"><p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={onPrevious}><ChevronLeft aria-hidden="true" />Trang trước</Button><Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || isFetching} onClick={onNext}>Trang sau<ChevronRight aria-hidden="true" /></Button></div></div>;
}
