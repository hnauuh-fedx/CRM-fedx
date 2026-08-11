import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/modules/auth/auth-context";

type ProtectedRouteProps = {
  anyPermissions?: string[];
};

const noRequiredPermissions: string[] = [];

export function ProtectedRoute({
  anyPermissions = noRequiredPermissions,
}: ProtectedRouteProps) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isRestoring) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <output className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-label="Đang tải phiên đăng nhập" />
          Đang tải phiên đăng nhập…
        </output>
      </main>
    );
  }

  if (!auth.user) {
    return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;
  }

  if (anyPermissions.length > 0 && !anyPermissions.some(auth.can)) {
    return <Navigate to="/khong-co-quyen" replace />;
  }

  return <Outlet />;
}
