import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function hasValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return Boolean(value);
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === "object") return Object.values(value).some(hasValue);
  return false;
}

type AutoFilterActionsProps = {
  snapshot: unknown;
  onApply: () => void;
  onReset: () => void;
  delay?: number;
};

export function AutoFilterActions({ snapshot, onApply, onReset, delay = 300 }: AutoFilterActionsProps) {
  const applyRef = useRef(onApply);
  const firstRenderRef = useRef(true);
  const serializedSnapshot = JSON.stringify(snapshot);

  useEffect(() => {
    applyRef.current = onApply;
  }, [onApply]);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    const timeout = window.setTimeout(() => applyRef.current(), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, serializedSnapshot]);

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-2 lg:self-end">
      {hasValue(snapshot) && <Badge variant="secondary">Đang lọc</Badge>}
      <Button type="button" variant="outline" onClick={onReset}>Xóa lọc</Button>
    </div>
  );
}
