import { createContext, use, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import type { LeadListItem } from "../lead.types";

// Pointer travel beyond this is a drag (e.g. selecting text to copy), not a click.
const dragThresholdPx = 5;

export const OpenLeadContext = createContext<((leadId: string) => void) | null>(null);

function hasSelectionInside(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return false;
  return selection.containsNode(element, true);
}

/**
 * The lead name is the only part of a list row that opens the detail popup. A span with
 * role="button" keeps the text selectable, which a native button would not.
 */
export function LeadNameTrigger({ lead }: { lead: Pick<LeadListItem, "id" | "fullName"> }) {
  const openLead = use(OpenLeadContext);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  function rememberPointer(event: PointerEvent<HTMLSpanElement>) {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  }

  function openOnClick(event: MouseEvent<HTMLSpanElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    const dragged = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) > dragThresholdPx : false;
    if (dragged || hasSelectionInside(event.currentTarget)) return;
    openLead?.(lead.id);
  }

  function openOnKey(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openLead?.(lead.id);
  }

  if (!openLead) return <span className="font-medium">{lead.fullName}</span>;
  return (
    <span
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`Mở thông tin ${lead.fullName}`}
      className="cursor-pointer select-text rounded-sm font-medium underline-offset-2 hover:text-primary hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onPointerDown={rememberPointer}
      onClick={openOnClick}
      onKeyDown={openOnKey}
    >
      {lead.fullName}
    </span>
  );
}
