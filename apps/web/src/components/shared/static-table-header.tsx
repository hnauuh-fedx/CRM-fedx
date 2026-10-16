import { TableHead, TableHeader, TableRow } from "@/components/ui/table";

type HeaderColumn = { label: string; className?: string };

export function StaticTableHeader({
  columns,
  className,
  rowClassName,
}: {
  columns: readonly HeaderColumn[];
  className?: string;
  rowClassName?: string;
}) {
  return (
    <TableHeader className={className}>
      <TableRow className={rowClassName}>
        {columns.map((column) => (
          <TableHead
            key={column.label}
            scope="col"
            className={column.className}
          >
            {column.label}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}
