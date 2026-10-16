import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getEffectiveDisplayLayout } from "@/services/display-layout.service";
import type { ColumnDef } from "@tanstack/react-table";
import { useSyncExternalStore, useState, useCallback } from "react";
import type { LeadListItem } from "./lead.types";
import {
  defaultDisplayColumnWidth,
  type ListLayoutScreen,
} from "@admission-crm/shared/display-layout";
const desktopQuery = "(min-width: 768px)";
const subscribe = (callback: () => void) => {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;
export const getLeadListLayoutScreen = (
  detailBasePath: string,
): ListLayoutScreen =>
  detailBasePath === "/sale/leads" ? "LEAD_LIST" : "CUSTOMER_LIST";

export function useLeadDisplayLayout(
  enabled: boolean,
  columns: ColumnDef<LeadListItem>[],
  screen: ListLayoutScreen = "LEAD_LIST",
) {
  const auth = useAuth();
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, () => false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const observe = useCallback(
    (callback: () => void) => {
      if (!container) return () => {};
      const observer = new ResizeObserver(callback);
      observer.observe(container);
      return () => observer.disconnect();
    },
    [container],
  );
  const containerSnapshot = useCallback(
    () => container?.clientWidth ?? 0,
    [container],
  );
  const containerWidth = useSyncExternalStore(
    observe,
    containerSnapshot,
    () => 0,
  );
  const { selectedProgramId } = useInstitutionProgram();
  const query = useQuery({
    queryKey: ["lead-display-layout", selectedProgramId, auth.user?.id, screen],
    queryFn: () => getEffectiveDisplayLayout(auth.accessToken!, screen),
    enabled,
    // Keep columns stable while the user is working. A new mount or reload adopts publication.
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const configuredFields = query.data?.visibleFields;
  const configuredFieldSet = new Set(configuredFields);
  const columnVisibility = configuredFields
    ? Object.fromEntries(
        columns.map((column) => {
          const key =
            column.id ??
            ("accessorKey" in column ? String(column.accessorKey) : "");
          return [
            key,
            key === "select" || key === "view" || configuredFieldSet.has(key),
          ];
        }),
      )
    : {};
  const columnOrder = configuredFields
    ? ["select", "view", ...configuredFields]
    : [];
  const pinnedWidth = (query.data?.pinnedFields ?? []).reduce(
    (total, key) =>
      total + (query.data?.columnWidths[key] ?? defaultDisplayColumnWidth),
    0,
  );
  // Reserve the two action columns and enough room to scroll the unpinned data.
  const hasPinSpace = containerWidth >= 48 + 56 + 240 + pinnedWidth;
  const columnPinning = {
    left: [
      "select",
      "view",
      ...(enabled && desktop && hasPinSpace
        ? (query.data?.pinnedFields ?? [])
        : []),
    ],
    right: [],
  };
  const columnSizing = {
    select: 48,
    view: 56,
    ...(query.data?.columnWidths ?? {}),
  };
  return {
    query,
    isLoading: enabled && query.isLoading,
    columnVisibility,
    columnOrder,
    columnPinning,
    columnSizing,
    layoutContainerRef: setContainer,
  };
}
