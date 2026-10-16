import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const POPOVER_CLOSE_DELAY_MS = 3000;

// These badges live inside clickable table rows; keep their interactions from opening the lead.
export const stopRowEvent = (event: SyntheticEvent) => event.stopPropagation();

/** A "+N" badge that reveals hidden items on hover and stays open briefly after the pointer leaves. */
export function HoverMorePopover({ count, label, title, children }: { count: number; label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // Keep the list open after the pointer leaves so actions inside it stay reachable.
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), POPOVER_CLOSE_DELAY_MS);
  };

  return (
    <Popover open={open} onOpenChange={(next) => (next ? show() : setOpen(false))}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stopRowEvent}
          onKeyDown={stopRowEvent}
          onPointerEnter={show}
          onPointerLeave={scheduleClose}
          className="inline-flex h-6 shrink-0 items-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={label}
        >
          +{count}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto min-w-44 p-2"
        onPointerEnter={show}
        onPointerLeave={scheduleClose}
        onClick={stopRowEvent}
        onKeyDown={stopRowEvent}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <p className="px-1 pb-1 text-xs text-muted-foreground">{title}</p>
        <ul className="flex flex-col gap-1">{children}</ul>
      </PopoverContent>
    </Popover>
  );
}
