/** Resolve stable IDs at drop time; never accept external payloads or stale indices. */
export function resolveMarketingFormReorder(ids: readonly string[], sourceId: string | null, targetId: string, lockFirst = false) {
  if (!sourceId || new Set(ids).size !== ids.length) return null;
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to || (lockFirst && (from === 0 || to === 0))) return null;
  return { from, to };
}

export function marketingFormIndexAfterMove(index: number | null, from: number, to: number) {
  if (index === null) return null;
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

export function moveMarketingFormItems<T>(items: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
