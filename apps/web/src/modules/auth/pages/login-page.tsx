import { Navigate, useLocation, useNavigate } from "react-router-dom";

import LoginForm from "@/components/shadcn-space/blocks/login-01/login";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/services/api";
import { useAuth } from "../auth-context";
import type { LoginFormValues } from "../login.schema";

type LoginLocationState = {
  from?: string;
};

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as LoginLocationState | null)?.from ?? "/tong-quan";

  if (auth.isRestoring) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <output className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-label="Đang kiểm tra phiên đăng nhập" />
        Đang kiểm tra phiên đăng nhập…
        </output>
      </main>
    );
  }

  if (auth.user) {
    return <Navigate to="/tong-quan" replace />;
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
