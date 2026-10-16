import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { resolveMarketingFormReorder } from "./marketing-form-reorder-model";

export function useMarketingFormReorder({ ids, onMove, label, lockFirst = false, disabled = false }: {
  ids: string[]; onMove: (from: number, to: number) => void; label: string; lockFirst?: boolean; disabled?: boolean;
}) {
  const instructionsId = useId();
  const source = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  function clear() { source.current = null; setOverId(null); }
  function move(sourceId: string | null, targetId: string) {
    const change = disabled ? null : resolveMarketingFormReorder(ids, sourceId, targetId, lockFirst);
    if (!change) return false;
    onMove(change.from, change.to);
    setAnnouncement(`Đã chuyển ${label} từ vị trí ${change.from + 1} đến vị trí ${change.to + 1}.`);
    return true;
  }
  function handleProps(id: string) {
    const locked = disabled || (lockFirst && id === ids[0]) || ids.length < (lockFirst ? 3 : 2);
    return {
      disabled: locked,
      draggable: !locked,
      "aria-describedby": instructionsId,
      "aria-keyshortcuts": "Alt+ArrowUp Alt+ArrowDown",
      onDragStart(event: DragEvent<HTMLButtonElement>) {
        if (locked) { event.preventDefault(); return; }
        source.current = id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-admission-form-reorder", id);
        setAnnouncement(`Đang kéo ${label} ${ids.indexOf(id) + 1}. Thả lên ${label} khác để đổi thứ tự; Escape để hủy.`);
      },
      onDragEnd: clear,
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key === "Escape") { clear(); setAnnouncement("Đã hủy kéo. Thứ tự được giữ nguyên."); return; }
        if (locked || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const target = ids[ids.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1)];
        if (target) move(id, target);
      },
    };
  }
  function itemProps(id: string) {
    return {
      "data-reorder-over": overId === id,
      onDragOver(event: DragEvent<HTMLElement>) {
        if (disabled || !resolveMarketingFormReorder(ids, source.current, id, lockFirst)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOverId(id);
      },
      onDrop(event: DragEvent<HTMLElement>) {
        if (!source.current) return;
        event.preventDefault(); event.stopPropagation();
        move(source.current, id);
        clear();
      },
    };
  }
  return { instructionsId, announcement, handleProps, itemProps, move };
}
