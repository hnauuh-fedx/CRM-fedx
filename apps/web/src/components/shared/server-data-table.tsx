import {
  flexRender,
  type Header,
  type Table as DataTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ServerDataTable<T>({
  table,
  caption,
  className,
}: {
  table: DataTable<T>;
  caption: string;
  className: string;
}) {
  return (
    <Table className={className}>
      <caption className="sr-only">{caption}</caption>
      <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-muted/55">
            {group.headers.map((header) => (
              <SortableHeader key={header.id} header={header} />
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id} className="px-5 py-4">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SortableHeader<T>({ header }: { header: Header<T, unknown> }) {
  const direction = header.column.getIsSorted();
  return (
    <TableHead
      scope="col"
      className="px-5 font-medium text-muted-foreground"
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : undefined
      }
    >
      {header.column.getCanSort() ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
          onClick={header.column.getToggleSortingHandler()}
        >
          {flexRender(header.column.columnDef.header, header.getContext())}
          <SortDirection direction={direction} />
        </button>
      ) : (
        flexRender(header.column.columnDef.header, header.getContext())
      )}
    </TableHead>
  );
}

function SortDirection({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ArrowUp aria-hidden="true" />;
  if (direction === "desc") return <ArrowDown aria-hidden="true" />;
  return <ArrowUpDown aria-hidden="true" />;
}
