import { createContext, use, useCallback, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api";
import { readInstitutionProgramReselectionRequired, readSelectedInstitutionProgramId, storeSelectedInstitutionProgramId, subscribeToInstitutionProgram } from "./institution-program-storage";
import { attemptInstitutionProgramChange, type InstitutionProgramChangeGuard } from "./institution-program-change";

export type InstitutionProgramOption = {
  id: string;
  name: string;
  code: string;
  institutionName: string;
};

type InstitutionProgramContextValue = {
  programs: InstitutionProgramOption[];
  selectedProgramId: string | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
  needsReselection: boolean;
  hasSelectedProgram: boolean;
  selectProgram: (programId: string) => boolean;
  registerProgramChangeGuard: (guard: InstitutionProgramChangeGuard) => () => void;
};

const InstitutionProgramContext = createContext<InstitutionProgramContextValue | null>(null);

export function InstitutionProgramProvider({ accessToken, userId, allowedProgramIds, children }: { accessToken: string; userId?: string; allowedProgramIds?: readonly string[]; children: ReactNode }) {
  const queryClient = useQueryClient();
  const storedProgramId = useSyncExternalStore(subscribeToInstitutionProgram, readSelectedInstitutionProgramId);
  const needsReselection = useSyncExternalStore(subscribeToInstitutionProgram, readInstitutionProgramReselectionRequired);
  const changeGuards = useRef(new Set<InstitutionProgramChangeGuard>());
  const registerProgramChangeGuard = useCallback((guard: InstitutionProgramChangeGuard) => {
    changeGuards.current.add(guard);
    return () => { changeGuards.current.delete(guard); };
  }, []);
  const optionsQuery = useQuery({
    queryKey: ["institution-programs", "options", userId, allowedProgramIds?.join(",")],
    queryFn: async ({ signal }) => {
      // This identity-scoped endpoint must remain available if the remembered
      // program was revoked. Business requests still send their program header.
      const response = await apiRequest<{ data: InstitutionProgramOption[] }>("/institution-programs/options", { signal, headers: { "X-Institution-Program-Id": "" } }, accessToken);
      signal.throwIfAborted();
      const storedProgramId = readSelectedInstitutionProgramId();
      const selectedProgramId = response.data.some((program) => program.id === storedProgramId)
        ? storedProgramId
        : null;
      if (storedProgramId && !selectedProgramId) {
        storeSelectedInstitutionProgramId(null);
      }
      return response;
    },
  });
  const programs = useMemo(() => optionsQuery.data?.data ?? [], [optionsQuery.data?.data]);
  const selectedProgramId = programs.some((program) => program.id === storedProgramId) ? storedProgramId : null;

  const selectProgram = useCallback((programId: string) => {
    return attemptInstitutionProgramChange(programId, selectedProgramId, programs.map(program => program.id), changeGuards.current, (nextProgramId) => {
      // Guards run first. Cancel/remove old scoped reads before changing the
      // header so an earlier response cannot fill the new workspace's cache.
      const scopedQueries = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "institution-programs" };
      void queryClient.cancelQueries(scopedQueries);
      queryClient.removeQueries(scopedQueries);
      storeSelectedInstitutionProgramId(nextProgramId);
    });
  }, [programs, queryClient, selectedProgramId]);
  const value = useMemo(
    () => ({
      programs,
      selectedProgramId,
      isLoading: optionsQuery.isLoading,
      error: optionsQuery.isError ? "Không thể tải chương trình làm việc. Vui lòng kiểm tra kết nối và thử lại." : null,
      retry: () => { void optionsQuery.refetch(); },
      needsReselection,
      hasSelectedProgram: programs.some((program) => program.id === selectedProgramId),
      selectProgram,
      registerProgramChangeGuard,
    }),
    [optionsQuery.isLoading, optionsQuery.isError, optionsQuery.refetch, needsReselection, programs, registerProgramChangeGuard, selectProgram, selectedProgramId],
  );
  return (
    <InstitutionProgramContext.Provider value={value}>
      {children}
    </InstitutionProgramContext.Provider>
  );
}

export function useInstitutionProgram() {
  const value = use(InstitutionProgramContext);
  if (!value) {
    throw new Error("useInstitutionProgram must be used within InstitutionProgramProvider.");
  }
  return value;
}
