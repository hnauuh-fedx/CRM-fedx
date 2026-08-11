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
import { getLeadAssignments, getSaleFilterOptions } from "@/services/sale.service";
import type { AssignmentFilters, AssignmentItem, AssignmentListResponse, SaleFilterOptions } from "../sale.types";

const pageSize = 20;
const emptyFilters: AssignmentFilters = { search: "", assigneeId: "", departmentId: "" };
const dateFormatter = new Intl.DateTimeFormat("vi-VN");

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

export function LeadAssignmentsPage() {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [sorting, setSorting] = useState<SortingState>([{ id: "assignedAt", desc: true }]);
  const sortOrder = (sorting[0]?.desc ?? true) ? "desc" : "asc";
  const listQuery = useQuery({
    queryKey: ["sale", "assignments", page, pageSize, sortOrder, filters],
    queryFn: () => getLeadAssignments({ page, limit: pageSize, sortOrder, ...filters }, auth.accessToken!),
    placeholderData: (previousData) => previousData,
  });
  const optionsQuery = useQuery({
    queryKey: ["sale", "options"],
    queryFn: () => getSaleFilterOptions(auth.accessToken!),
  });
  const data = listQuery.data?.data ?? [];
  const table = useReactTable({
    data,
    columns: useColumns(),
    state: { sorting },
    manualSorting: true,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return next.length ? [{ id: "assignedAt", desc: next[0].desc }] : [{ id: "assignedAt", desc: true }];
      });
      setPage(1);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Sale"
        title="Phân công lead"
        scopeLabel="Toàn hệ thống"
        description="Theo dõi các lượt phân công lead theo nhân viên và phòng ban."
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

function useColumns() {
  return useMemo<ColumnDef<AssignmentItem>[]>(
    () => [
      {
        id: "lead",
        header: "Lead",
        enableSorting: false,
        cell: ({ row }) => row.original.lead ? `${row.original.lead.fullName} (${row.original.lead.leadCode ?? "chưa có mã"})` : "-",
      },
      { id: "assignee", header: "Nhân viên", enableSorting: false, cell: ({ row }) => row.original.assignee?.fullName ?? "-" },
      { id: "department", header: "Phòng ban", enableSorting: false, cell: ({ row }) => row.original.department?.name ?? "-" },
      { id: "assignedBy", header: "Người phân công", enableSorting: false, cell: ({ row }) => row.original.assignedBy?.fullName ?? "Hệ thống" },
      {
        id: "owner",
        header: "Vai trò",
        enableSorting: false,
        cell: ({ row }) => <Badge variant="secondary">{row.original.isMainOwner ? "Phụ trách chính" : "Phối hợp"}</Badge>,
      },
      { accessorKey: "assignedAt", header: "Ngày phân công", cell: ({ row }) => formatDate(row.original.assignedAt) },
    ],
    [],
  );
}

function Filters({ filters, options, onChange, onApply, onReset }: {
  filters: AssignmentFilters;
  options?: SaleFilterOptions;
  onChange: (field: keyof AssignmentFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="gap-1 px-5">
        <CardTitle>Bộ lọc phân công</CardTitle>
        <CardDescription>Tìm theo lead hoặc nhân viên phụ trách.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form onSubmit={(event) => { event.preventDefault(); onApply(); }}>
          <FieldGroup className="grid gap-4 lg:grid-cols-[minmax(240px,2fr)_repeat(2,minmax(180px,1fr))_auto]">
            <Field className="gap-2">
              <FieldLabel htmlFor="assignment-search">Tìm kiếm</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="assignment-search" className="pl-9" placeholder="Nhập mã lead, họ tên hoặc nhân viên" value={filters.search} onChange={(event) => onChange("search", event.target.value)} />
              </div>
            </Field>
            <FilterSelect id="assignment-assignee" label="Nhân viên" value={filters.assigneeId} onChange={(value) => onChange("assigneeId", value)} options={(options?.assignees ?? []).map((item) => ({ value: item.id, label: item.fullName }))} />
            <FilterSelect id="assignment-department" label="Phòng ban" value={filters.departmentId} onChange={(value) => onChange("departmentId", value)} options={(options?.departments ?? []).map((item) => ({ value: item.id, label: item.name }))} />
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
  table: DataTable<AssignmentItem>;
  data: AssignmentItem[];
  pagination?: AssignmentListResponse["pagination"];
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
        <CardTitle>Lượt phân công</CardTitle>
        <CardDescription>{pagination ? `Hiển thị ${data.length} trong tổng số ${pagination.total} lượt phân công` : "Đang lấy dữ liệu phân công…"}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? <ErrorState title="Không thể tải phân công lead" description="Vui lòng thử lại để cập nhật dữ liệu phân công." onReload={onReload} /> : isLoading ? (
          <TableLoadingState label="Đang tải phân công lead" />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có phân công phù hợp với bộ lọc" description="Điều chỉnh bộ lọc để tìm lượt phân công cần theo dõi." />
        ) : <SortableTable table={table} />}
      </CardContent>
      {pagination && pagination.total > 0 && <Pager page={page} pagination={pagination} isFetching={isFetching} onPrevious={onPrevious} onNext={onNext} />}
    </Card>
  );
}

function SortableTable({ table }: { table: DataTable<AssignmentItem> }) {
  return <Table className="min-w-260"><caption className="sr-only">Danh sách phân công lead</caption><TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">{table.getHeaderGroups().map((group) => <TableRow key={group.id} className="hover:bg-muted/55">{group.headers.map((header) => <SortHeader key={header.id} header={header} />)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="px-5 py-4">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table>;
}

function SortHeader({ header }: { header: Header<AssignmentItem, unknown> }) {
  const direction = header.column.getIsSorted();
  return <TableHead scope="col" className="px-5 font-medium text-muted-foreground" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}>{header.column.getCanSort() ? <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{direction === "asc" ? <ArrowUp aria-hidden="true" /> : direction === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}</button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>;
}

function Pager({ page, pagination, isFetching, onPrevious, onNext }: { page: number; pagination: AssignmentListResponse["pagination"]; isFetching: boolean; onPrevious: () => void; onNext: () => void }) {
  return <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row"><p className="text-muted-foreground">Trang {pagination.page} / {pagination.totalPages}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={onPrevious}><ChevronLeft aria-hidden="true" />Trang trước</Button><Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || isFetching} onClick={onNext}>Trang sau<ChevronRight aria-hidden="true" /></Button></div></div>;
}
