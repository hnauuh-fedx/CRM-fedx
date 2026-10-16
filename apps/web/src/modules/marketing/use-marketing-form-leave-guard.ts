import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { useInstitutionProgram } from "../institutions/institution-program-context";
import { preventMarketingFormUnload, shouldBlockMarketingFormRoute } from "./marketing-form-leave-model";

const formListPath = "/marketing/form-survey";

export function useMarketingFormLeaveGuard(dirty: boolean, saving: boolean) {
  const { registerProgramChangeGuard, selectProgram, programs } = useInstitutionProgram();
  const navigate = useNavigate();
  const [requestedProgramId, setRequestedProgramId] = useState<string | null>(null);
  const approvedProgramId = useRef<string | null>(null);
  const approvedRoute = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (approvedRoute.current && nextLocation.pathname === formListPath && !nextLocation.search) {
      approvedRoute.current = false;
      return false;
    }
    return shouldBlockMarketingFormRoute(dirty, saving, currentLocation, nextLocation);
  });

  useEffect(() => registerProgramChangeGuard((programId) => {
    if (approvedProgramId.current === programId) {
      approvedProgramId.current = null;
      return true;
    }
    if (!dirty && !saving) return true;
    setRequestedProgramId(current => current ?? programId);
    return false;
  }), [dirty, saving, registerProgramChangeGuard]);

  useEffect(() => {
    if (!dirty && !saving) return;
    window.addEventListener("beforeunload", preventMarketingFormUnload);
    return () => window.removeEventListener("beforeunload", preventMarketingFormUnload);
  }, [dirty, saving]);

  function stay() {
    setRequestedProgramId(null);
    if (blocker.state === "blocked") blocker.reset();
  }

  function leave() {
    if (saving) return;
    if (blocker.state === "blocked") {
      setRequestedProgramId(null);
      blocker.proceed();
    } else if (requestedProgramId) {
      approvedProgramId.current = requestedProgramId;
      const changed = selectProgram(requestedProgramId);
      approvedProgramId.current = null;
      setRequestedProgramId(null);
      if (changed) {
        approvedRoute.current = true;
        navigate(formListPath, { replace: true });
      }
    }
  }

  return {
    open: blocker.state === "blocked" || requestedProgramId !== null,
    saving,
    dirty,
    programName: blocker.state === "blocked" ? undefined : programs.find(program => program.id === requestedProgramId)?.name,
    stay,
    leave,
  };
}
