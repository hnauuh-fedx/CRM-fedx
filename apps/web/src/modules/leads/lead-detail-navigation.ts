/**
 * Router state passed by "open detail" entry points (eye icon, "Mở trang chi tiết") so the
 * detail page opens with the edit form already shown. Other ways of reaching the page stay read-only.
 */
export const openLeadInEditModeState = { openEdit: true } as const;

export function shouldOpenLeadInEditMode(state: unknown) {
  return typeof state === "object" && state !== null && (state as { openEdit?: unknown }).openEdit === true;
}
