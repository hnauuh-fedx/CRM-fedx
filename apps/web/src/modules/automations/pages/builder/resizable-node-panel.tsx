import { useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

export function ResizableNodePanel({ children }: { children: ReactNode }) {
  const [panelWidth, setPanelWidth] = useState(480);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeStart = useRef<{ x: number; width: number; maxWidth: number } | null>(null);
  const getMaxWidth = () => {
    const containerWidth = panelRef.current?.parentElement?.clientWidth ?? window.innerWidth;
    return Math.min(800, containerWidth >= 768 ? Math.max(360, containerWidth - 320) : containerWidth);
  };
  const resizePanel = (width: number, maxWidth = getMaxWidth()) => {
    setPanelWidth(Math.min(maxWidth, Math.max(Math.min(360, maxWidth), width)));
  };

  return (
    <div ref={panelRef} style={{ width: panelWidth }} className="absolute inset-y-0 right-0 z-10 flex h-full min-h-0 max-w-full shrink-0 flex-col border-l bg-background shadow-sm md:relative md:inset-auto">
      <div
        role="separator"
        tabIndex={0}
        aria-label="Thay đổi chiều rộng bảng cấu hình node"
        aria-orientation="vertical"
        aria-valuemin={360}
        aria-valuemax={800}
        aria-valuenow={panelWidth}
        aria-controls="node-properties-content"
        title="Kéo sang trái/phải để thay đổi chiều rộng. Dùng phím mũi tên khi đang chọn thanh kéo."
        className="absolute inset-y-0 -left-2 z-20 flex w-4 touch-none select-none items-center justify-center cursor-col-resize focus-visible:outline-2 focus-visible:outline-ring"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeStart.current = { x: event.clientX, width: panelRef.current?.getBoundingClientRect().width ?? panelWidth, maxWidth: getMaxWidth() };
        }}
        onPointerMove={(event) => {
          if (!resizeStart.current) return;
          resizePanel(resizeStart.current.width + resizeStart.current.x - event.clientX, resizeStart.current.maxWidth);
        }}
        onPointerUp={(event) => {
          resizeStart.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { resizeStart.current = null; }}
        onLostPointerCapture={() => { resizeStart.current = null; }}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          resizePanel(event.key === "Home" ? 360 : event.key === "End" ? getMaxWidth() : panelWidth + (event.key === "ArrowLeft" ? 32 : -32));
        }}
      >
        <span className="flex h-12 w-3 items-center justify-center rounded-full border bg-muted text-muted-foreground">
          <GripVertical className="size-3" aria-hidden="true" />
        </span>
      </div>
      {children}
    </div>
  );
}
