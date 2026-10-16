import type { CSSProperties } from "react";
import type { Column } from "@tanstack/react-table";
import type { LeadListItem } from "../lead.types";

export function leadColumnStyle(
  column: Column<LeadListItem>,
  header: boolean,
): CSSProperties {
  const pinned = column.getIsPinned() === "left";
  return {
    paddingLeft: column.id === "view" ? 8 : undefined,
    paddingRight: column.id === "view" ? 8 : undefined,
    width: column.getSize(),
    minWidth: column.getSize(),
    maxWidth: column.getSize(),
    position: pinned ? "sticky" : undefined,
    left: pinned ? column.getStart("left") : undefined,
    zIndex: pinned ? (header ? 20 : 10) : undefined,
  };
}
export function leadColumnClass(pinned: boolean, header: boolean) {
  if (header)
    return pinned
      ? "overflow-hidden border-r bg-muted px-3 font-medium"
      : "overflow-hidden px-3 font-medium text-muted-foreground";
  return pinned
    ? "overflow-hidden border-r bg-background px-3 py-4 group-hover:bg-muted group-data-[state=selected]:bg-muted"
    : "overflow-hidden px-3 py-4";
}
