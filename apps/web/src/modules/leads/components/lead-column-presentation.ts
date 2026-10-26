import type { CSSProperties } from "react";
import type { Column } from "@tanstack/react-table";
import type { LeadListItem } from "../lead.types";

// Checkbox and view-icon columns only need enough room to read as separate columns.
const compactColumns = new Set(["select", "view"]);

/**
 * Columns with a configured width keep it; other columns grow to their longest value.
 * `left` is the measured sticky offset because auto-sized pinned columns have no known size.
 */
export function leadColumnStyle(
  column: Column<LeadListItem>,
  header: boolean,
  fixedWidth: boolean,
  left?: number,
): CSSProperties {
  const pinned = column.getIsPinned() === "left";
  const width = fixedWidth ? column.getSize() : undefined;
  return {
    paddingLeft: compactColumns.has(column.id) ? 6 : undefined,
    paddingRight: compactColumns.has(column.id) ? 6 : undefined,
    width,
    minWidth: width,
    maxWidth: width,
    position: pinned ? "sticky" : undefined,
    left: pinned ? (left ?? column.getStart("left")) : undefined,
    zIndex: pinned ? (header ? 20 : 10) : undefined,
  };
}
export function leadColumnClass(pinned: boolean, header: boolean, lastPinned = false) {
  const divider = lastPinned ? " border-r-border" : "";
  if (header)
    return pinned
      ? `whitespace-nowrap bg-muted px-3 font-medium${divider}`
      : "whitespace-nowrap px-3 font-medium text-muted-foreground";
  return pinned
    ? `whitespace-nowrap bg-card px-3 py-2 group-hover:bg-muted group-data-[state=selected]:bg-muted${divider}`
    : "whitespace-nowrap px-3 py-2";
}
