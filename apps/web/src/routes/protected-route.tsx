import { SessionLoadingState } from "@/components/shared/page-loading-state";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/modules/auth/auth-context";
import { SessionRestoreError } from "@/modules/auth/session-restore-error";

type ProtectedRouteProps = {
  anyPermissions?: string[];
};

const noRequiredPermissions: string[] = [];

export function ProtectedRoute({
  anyPermissions = noRequiredPermissions,
}: ProtectedRouteProps) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isRestoring) return <SessionLoadingState />;

  if (auth.restoreError && !auth.user) return <SessionRestoreError message={auth.restoreError} onRetry={auth.retryRestore} />;

  if (!auth.user) {
    return <Navigate to="/dang-nhap" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }

  if (anyPermissions.length > 0 && !anyPermissions.some(auth.can)) {
    return <Navigate to="/khong-co-quyen" replace />;
  }

  return <Outlet />;
}
