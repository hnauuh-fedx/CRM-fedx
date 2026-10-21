import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Keeps `count` items on a single row while each item can stay at least `minItemWidth` wide.
 * When they no longer fit, items split into the fewest rows possible with an equal number of
 * columns per row (e.g. 8 items → 4 + 4 instead of 7 + 1).
 */
export function useBalancedColumns<T extends HTMLElement>(count: number, minItemWidth: number, gap = 8) {
  const ref = useRef<T>(null);
  const [columns, setColumns] = useState(Math.max(count, 1));

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || count === 0) return;

    const update = () => {
      const maxColumns = Math.max(1, Math.floor((element.clientWidth + gap) / (minItemWidth + gap)));
      const rows = Math.ceil(count / maxColumns);
      setColumns(Math.ceil(count / rows));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [count, minItemWidth, gap]);

  const style: CSSProperties = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  return { ref, style };
}
