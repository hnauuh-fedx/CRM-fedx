import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api";
import { readSelectedInstitutionProgramId, storeSelectedInstitutionProgramId } from "./institution-program-storage";
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
  hasSelectedProgram: boolean;
  selectProgram: (programId: string) => boolean;
  registerProgramChangeGuard: (guard: InstitutionProgramChangeGuard) => () => void;
};

const InstitutionProgramContext = createContext<InstitutionProgramContextValue | null>(null);

export function InstitutionProgramProvider({ accessToken, children }: { accessToken: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [changedProgramId, setChangedProgramId] = useState<string | null>(null);
  const changeGuards = useRef(new Set<InstitutionProgramChangeGuard>());
  const registerProgramChangeGuard = useCallback((guard: InstitutionProgramChangeGuard) => {
    changeGuards.current.add(guard);
    return () => { changeGuards.current.delete(guard); };
  }, []);
  const optionsQuery = useQuery({
    queryKey: ["institution-programs", "options"],
    queryFn: async () => {
      const response = await apiRequest<{ data: InstitutionProgramOption[] }>("/institution-programs/options", {}, accessToken);
      const storedProgramId = readSelectedInstitutionProgramId();
      const selectedProgramId = response.data.some((program) => program.id === storedProgramId)
        ? storedProgramId
        : (response.data[0]?.id ?? null);
      if (selectedProgramId && selectedProgramId !== storedProgramId) {
        storeSelectedInstitutionProgramId(selectedProgramId);
      }
      return { ...response, selectedProgramId };
    },
  });
  const programs = useMemo(() => optionsQuery.data?.data ?? [], [optionsQuery.data?.data]);
  const selectedProgramId = programs.some((program) => program.id === changedProgramId)
    ? changedProgramId
    : (optionsQuery.data?.selectedProgramId ?? null);

  const selectProgram = useCallback((programId: string) => {
    return attemptInstitutionProgramChange(programId, selectedProgramId, programs.map(program => program.id), changeGuards.current, (nextProgramId) => {
      storeSelectedInstitutionProgramId(nextProgramId);
      setChangedProgramId(nextProgramId);
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "institution-programs",
      });
    });
  }, [programs, queryClient, selectedProgramId]);
  const value = useMemo(
    () => ({
      programs,
      selectedProgramId,
      isLoading: optionsQuery.isLoading,
      hasSelectedProgram: programs.some((program) => program.id === selectedProgramId),
      selectProgram,
      registerProgramChangeGuard,
    }),
    [optionsQuery.isLoading, programs, registerProgramChangeGuard, selectProgram, selectedProgramId],
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
