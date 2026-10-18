import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeadImportError } from "../lead.types";

const columns: ColumnDef<LeadImportError>[] = [
  { accessorKey: "row", header: "Dòng" },
  { accessorKey: "fullName", header: "Ứng viên", cell: ({ row }) => row.original.fullName ?? "-" },
  { accessorKey: "phone", header: "SĐT", cell: ({ row }) => row.original.phone ?? "-" },
  { accessorKey: "message", header: "Lý do" },
];

export function LeadImportErrorsTable({ errors }: { errors: LeadImportError[] }) {
  const table = useReactTable({
    data: errors,
    columns,
    getRowId: (item) => String(item.row),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
    autoResetPageIndex: true,
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const start = errors.length ? pageIndex * pageSize + 1 : 0;
  const end = Math.min((pageIndex + 1) * pageSize, errors.length);

  return (
    <div className="min-w-0 overflow-hidden rounded-md border bg-background">
      <Table>
        <TableCaption className="sr-only">Danh sách lỗi import lead</TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} className="px-4">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="px-4 whitespace-normal wrap-anywhere">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm">
        <p role="status" aria-live="polite" className="text-muted-foreground">
          Hiển thị lỗi {start}–{end} / {errors.length}. Trang {pageIndex + 1} / {Math.max(1, table.getPageCount())}.
        </p>
        <nav aria-label="Phân trang lỗi import" className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Trang đầu" disabled={!table.getCanPreviousPage()} onClick={() => table.firstPage()}>
            <ChevronFirst aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <ChevronLeft data-icon="inline-start" aria-hidden="true" />
            Trang trước
          </Button>
          <Button type="button" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Trang sau
            <ChevronRight data-icon="inline-end" aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label="Trang cuối" disabled={!table.getCanNextPage()} onClick={() => table.lastPage()}>
            <ChevronLast aria-hidden="true" />
          </Button>
        </nav>
      </div>
    </div>
  );
}
