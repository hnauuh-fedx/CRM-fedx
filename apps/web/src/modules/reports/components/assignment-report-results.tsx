import { useMemo } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type OnChangeFn, type PaginationState, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { assignmentEventLabels, assignmentEventTypes, type AssignmentReportResponse, type AssignmentReportFilters, type AssignmentReportRow } from "@admission-crm/shared/assignment-report";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataPagination } from "@/components/shared/data-pagination";
import type { AssignmentDetailTarget } from "./assignment-report-details";

const formatter = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
type Props = {
  report: AssignmentReportResponse; filters: AssignmentReportFilters; busy: boolean;
  pagination: PaginationState; sorting: SortingState;
  onPaginationChange: OnChangeFn<PaginationState>; onSortingChange: OnChangeFn<SortingState>;
  onOpen: (target: AssignmentDetailTarget) => void;
};
export function AssignmentReportResults({ report, filters, busy, pagination, sorting, onPaginationChange, onSortingChange, onOpen }: Props) {
  const selectedTypes = useMemo(() => new Set(filters.eventTypes), [filters.eventTypes]);
  const columns = useMemo<ColumnDef<AssignmentReportRow>[]>(() => [
    { id: "name", accessorKey: "name", header: "Nhân viên" },
    ...assignmentEventTypes.map((type): ColumnDef<AssignmentReportRow> => ({
      id: type, accessorKey: type, header: assignmentEventLabels[type],
      cell: ({ row }) => !selectedTypes.has(type) ? <span aria-label="Không chọn loại sự kiện này">—</span> :
        <Button type="button" variant="link" disabled={!row.original[type]} aria-label={`${assignmentEventLabels[type]} của ${row.original.name}: ${row.original[type]}`}
          onClick={() => onOpen({ type, assigneeId: row.original.assigneeId, name: row.original.name })}>{formatter.format(row.original[type])}</Button>,
    })),
  ], [selectedTypes, onOpen]);
  const table = useReactTable({ columns, data: report.rows, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.assigneeId,
    manualPagination: true, manualSorting: true, enableSortingRemoval: false, rowCount: report.pagination.total,
    state: { sorting, pagination }, onPaginationChange, onSortingChange,
  });
  return <>
    <p className="text-sm text-muted-foreground">Dữ liệu được ghi nhận từ ngày {dateFormatter.format(new Date(report.recordedFrom))}. Các sự kiện trước thời điểm này chưa được thống kê.</p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {assignmentEventTypes.map((type) => <Card key={type}><CardHeader><CardDescription>{assignmentEventLabels[type]}</CardDescription><CardTitle>
        {!selectedTypes.has(type) ? "—" : <Button type="button" variant="link" className="h-auto p-0 text-2xl tabular-nums" disabled={!report.summary[type]} onClick={() => onOpen({ type })} aria-label={`Xem ${assignmentEventLabels[type].toLocaleLowerCase("vi-VN")}: ${report.summary[type]}`}>{formatter.format(report.summary[type])}</Button>}
      </CardTitle></CardHeader></Card>)}
    </div>
    <Table><TableCaption>{formatter.format(report.pagination.total)} nhân viên có sự kiện phù hợp</TableCaption>
      <TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id} aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none"}>
        <Button type="button" variant="ghost" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}
          {header.column.getIsSorted() === "asc" ? <ArrowUp data-icon="inline-end" aria-hidden="true" /> : header.column.getIsSorted() === "desc" ? <ArrowDown data-icon="inline-end" aria-hidden="true" /> : null}
        </Button></TableHead>)}</TableRow>)}</TableHeader>
      <TableBody>{!table.getRowModel().rows.length ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Chưa có sự kiện phù hợp. Hãy thử khoảng ngày hoặc bộ lọc khác.</TableCell></TableRow> : table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className={cell.column.id === "name" ? "font-medium" : "tabular-nums"}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody>
    </Table>
    <DataPagination pagination={{ ...report.pagination, totalPages: Math.max(1, Math.ceil(report.pagination.total / pagination.pageSize)) }} pageSize={pagination.pageSize} pageSizeOptions={[10, 20, 50]} isFetching={busy}
      onPageChange={(page) => onPaginationChange({ ...pagination, pageIndex: page - 1 })} onPageSizeChange={(pageSize) => onPaginationChange({ pageIndex: 0, pageSize })} ariaLabel="Phân trang thống kê nhân viên" />
  </>;
}
