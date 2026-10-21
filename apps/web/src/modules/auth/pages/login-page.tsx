import { SessionLoadingState } from "@/components/shared/page-loading-state";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import LoginForm from "@/components/shadcn-space/blocks/login-01/login";
import { ApiError } from "@/services/api";
import { useAuth } from "../auth-context";
import type { LoginFormValues } from "../login.schema";
import { SessionRestoreError } from "../session-restore-error";

type LoginLocationState = {
  from?: string;
};

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as LoginLocationState | null)?.from ?? "/tong-quan";

  if (auth.isRestoring) return <SessionLoadingState />;

  if (auth.restoreError && !auth.user) return <SessionRestoreError message={auth.restoreError} onRetry={auth.retryRestore} />;

  if (auth.user) {
    return <Navigate to={from} replace />;
  }

  async function handleLogin(values: LoginFormValues) {
    try {
      await auth.signIn(values);
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(error.message);
      }

      throw new Error("Không thể đăng nhập lúc này. Vui lòng thử lại.");
    }
  }

  return <LoginForm onLogin={handleLogin} />;
}
