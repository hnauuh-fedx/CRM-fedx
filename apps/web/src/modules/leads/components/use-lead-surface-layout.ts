import { useQuery } from "@tanstack/react-query";
import type { LayoutScreen } from "@admission-crm/shared/display-layout";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getEffectiveDisplayLayout } from "@/services/display-layout.service";

export function useLeadSurfaceLayout(
  screen: LayoutScreen,
  enabled: boolean,
  programId?: string,
) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const program = programId || selectedProgramId;
  return useQuery({
    queryKey: ["lead-surface-layout", program, auth.user?.id, screen],
    queryFn: () =>
      getEffectiveDisplayLayout(auth.accessToken!, screen, program!),
    enabled: Boolean(enabled && auth.accessToken && program),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
  });
}
