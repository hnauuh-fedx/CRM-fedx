import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { flexRender, type Column, type Table as DataTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeadListItem } from "../lead.types";
import { leadColumnClass, leadColumnStyle } from "./lead-column-presentation";

const actionColumns = new Set(["select", "view"]);
// px-3 on both sides of a data cell.
const cellPaddingX = 24;

type PinnedOffsets = Record<string, number>;

function sameOffsets(a: PinnedOffsets, b: PinnedOffsets) {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((key) => a[key] === b[key]);
}

export function LeadListTable({
  table,
  onEditLead,
}: {
  table: DataTable<LeadListItem>;
  onEditLead: (leadId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const [pinnedOffsets, setPinnedOffsets] = useState<PinnedOffsets>({});
  const sizing = table.getState().columnSizing;
  const leftPinned = table.getLeftLeafColumns().map((column) => column.id);
  const lastPinned = leftPinned[leftPinned.length - 1];
  const pinnedKey = leftPinned.join("|");

  // Sticky offsets come from rendered widths because auto-sized columns have no fixed size.
  useLayoutEffect(() => {
    const row = headerRowRef.current;
    if (!row) return;
    const cells = () => [...row.querySelectorAll<HTMLTableCellElement>("th[data-pinned='left']")];
    const update = () => {
      const next: PinnedOffsets = {};
      let left = 0;
      for (const cell of cells()) {
        next[cell.dataset.columnId!] = left;
        left += cell.getBoundingClientRect().width;
      }
      setPinnedOffsets((current) => (sameOffsets(current, next) ? current : next));
    };
    update();
    const observer = new ResizeObserver(update);
    cells().forEach((cell) => observer.observe(cell));
    return () => observer.disconnect();
  }, [pinnedKey]);

  function openLeadWithKeyboard(event: KeyboardEvent<HTMLTableRowElement>, leadId: string) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onEditLead(leadId);
    }
  }

  const isFixed = (column: Column<LeadListItem>) => column.id in sizing;
  const columnProps = (column: Column<LeadListItem>, header: boolean) => {
    const pinned = column.getIsPinned() === "left";
    return {
      style: leadColumnStyle(column, header, isFixed(column), pinnedOffsets[column.id]),
      className: leadColumnClass(pinned, header, column.id === lastPinned),
    };
  };
  // A configured width must cap the content too; table cells alone grow to fit it.
  const fitContent = (column: Column<LeadListItem>, content: ReactNode) =>
    isFixed(column) && !actionColumns.has(column.id) ? (
      <div className="overflow-hidden" style={{ width: Math.max(column.getSize() - cellPaddingX, 0) }}>
        {content}
      </div>
    ) : (
      content
    );

  return (
    <>
      <div
        ref={scrollRef}
        data-slot="table-container"
        className="relative w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <table ref={tableRef} data-slot="table" className="w-max min-w-full caption-bottom text-sm">
          <caption className="sr-only">Toàn bộ trường thông tin lead được phép truy cập</caption>
          <TableHeader className="bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} ref={headerRowRef} className="hover:bg-muted/55">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      data-column-id={header.column.id}
                      data-pinned={header.column.getIsPinned() || undefined}
                      {...columnProps(header.column, true)}
                      aria-sort={
                        sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : undefined
                      }
                    >
                      {canSort ? (
                        <button
                          type="button"
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={`Sắp xếp theo ${String(header.column.columnDef.header)}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDirection === "asc" ? (
                            <ArrowUp aria-hidden="true" />
                          ) : sortDirection === "desc" ? (
                            <ArrowDown aria-hidden="true" />
                          ) : (
                            <ArrowUpDown aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className="group cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                tabIndex={0}
                aria-label={`${row.original.fullName} — nhấn Enter hoặc nhấp đúp để mở chi tiết`}
                onDoubleClick={() => onEditLead(row.original.id)}
                onKeyDown={(event) => openLeadWithKeyboard(event, row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} {...columnProps(cell.column, false)}>
                    {fitContent(cell.column, flexRender(cell.column.columnDef.cell, cell.getContext()))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
      <StickyHorizontalScrollbar scrollRef={scrollRef} tableRef={tableRef} />
    </>
  );
}

/**
 * Mirrors the table's horizontal scroll in a bar pinned to the bottom of the viewport,
 * so users can scroll sideways without reaching the end of the list first.
 */
function StickyHorizontalScrollbar({
  scrollRef,
  tableRef,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLTableElement | null>;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ content: 0, viewport: 0 });

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const tableElement = tableRef.current;
    const bar = barRef.current;
    if (!container || !tableElement || !bar) return;
    const measure = () =>
      setSize((current) =>
        current.content === container.scrollWidth && current.viewport === container.clientWidth
          ? current
          : { content: container.scrollWidth, viewport: container.clientWidth },
      );
    const syncBar = () => {
      if (bar.scrollLeft !== container.scrollLeft) bar.scrollLeft = container.scrollLeft;
    };
    const syncContainer = () => {
      if (container.scrollLeft !== bar.scrollLeft) container.scrollLeft = bar.scrollLeft;
    };
    measure();
    syncBar();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(tableElement);
    container.addEventListener("scroll", syncBar, { passive: true });
    bar.addEventListener("scroll", syncContainer, { passive: true });
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", syncBar);
      bar.removeEventListener("scroll", syncContainer);
    };
  }, [scrollRef, tableRef]);

  const scrollable = size.content > size.viewport + 1;
  // A hidden bar ignores scrollLeft, so align it again once it is shown.
  useLayoutEffect(() => {
    if (scrollable && barRef.current && scrollRef.current) barRef.current.scrollLeft = scrollRef.current.scrollLeft;
  }, [scrollable, scrollRef]);
  return (
    <div
      ref={barRef}
      className={scrollable ? "sticky bottom-0 z-30 overflow-x-auto overflow-y-hidden border-t bg-card" : "hidden"}
      aria-hidden="true"
    >
      <div style={{ width: size.content, height: 1 }} />
    </div>
  );
}
