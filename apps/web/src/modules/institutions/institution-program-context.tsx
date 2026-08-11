import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/services/api";
import { readSelectedInstitutionProgramId, storeSelectedInstitutionProgramId } from "./institution-program-storage";

export type InstitutionProgramOption = {
  id: string;
  name: string;
  code: string;
  institutionName: string;
  programTypeName: string;
};

type InstitutionProgramContextValue = {
  programs: InstitutionProgramOption[];
  selectedProgramId: string | null;
  isLoading: boolean;
  hasSelectedProgram: boolean;
  selectProgram: (programId: string) => void;
};

const InstitutionProgramContext = createContext<InstitutionProgramContextValue | null>(null);

export function InstitutionProgramProvider({ accessToken, children }: { accessToken: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [changedProgramId, setChangedProgramId] = useState<string | null>(null);
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
    if (programId === selectedProgramId) {
      return;
    }
    storeSelectedInstitutionProgramId(programId);
    setChangedProgramId(programId);
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== "institution-programs",
    });
  }, [queryClient, selectedProgramId]);
  const value = useMemo(
    () => ({
      programs,
      selectedProgramId,
      isLoading: optionsQuery.isLoading,
      hasSelectedProgram: programs.some((program) => program.id === selectedProgramId),
      selectProgram,
    }),
    [optionsQuery.isLoading, programs, selectProgram, selectedProgramId],
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
