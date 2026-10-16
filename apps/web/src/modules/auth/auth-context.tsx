import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, unauthorizedApiEvent } from "@/services/api";
import { getCurrentUser } from "@/services/auth.service";
import type { AuthSession, AuthUser, LoginInput } from "@/types/auth";
import { currentSession, refreshSession, requireSession, sessionChangedEvent, sessionRequiredEvent, signInSession, signOutSession, subscribeToOtherTabs } from "./session-client";
import { ReauthDialog } from "./reauth-dialog";
import { clearLegacyAccessTokens } from "./auth-storage";

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  isRestoring: boolean;
  restoreError: string | null;
  retryRestore: () => void;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(currentSession);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const profileQuery = useQuery({
    queryKey: ["auth", "me", session?.user.id],
    queryFn: () => getCurrentUser(session!.accessToken),
    enabled: Boolean(session) && !needsLogin,
  });
  const user = profileQuery.data?.user ?? session?.user ?? null;

  const restore = useCallback(async () => {
    setIsRestoring(true);
    setRestoreError(null);
    try { await refreshSession(); }
    catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setRestoreError("Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.");
      }
    } finally { setIsRestoring(false); }
  }, []);

  useEffect(() => {
    // One-time upgrade: legacy bearer tokens cannot create a managed session.
    clearLegacyAccessTokens();
    const update = () => setSession(currentSession());
    const expire = () => { setNeedsLogin(true); void queryClient.cancelQueries(); };
    window.addEventListener(sessionChangedEvent, update);
    window.addEventListener(sessionRequiredEvent, expire);
    window.addEventListener(unauthorizedApiEvent, requireSession);
    const unsubscribe = subscribeToOtherTabs(() => {
      setNeedsLogin(false);
      setRestoreError(null);
      void queryClient.cancelQueries().then(() => queryClient.clear());
    });
    void restore();
    return () => {
      window.removeEventListener(sessionChangedEvent, update);
      window.removeEventListener(sessionRequiredEvent, expire);
      window.removeEventListener(unauthorizedApiEvent, requireSession);
      unsubscribe();
    };
  }, [queryClient, restore]);

  const signIn = useCallback(async (input: LoginInput) => {
    const previous = currentSession();
    const next = await signInSession(input);
    if (!previous || previous.user.id !== next.user.id) {
      await queryClient.cancelQueries();
      queryClient.clear();
    }
    setNeedsLogin(false);
    setRestoreError(null);
    setActionError(null);
    queryClient.setQueryData(["auth", "me", next.user.id], { user: next.user });
    if (previous?.user.id === next.user.id) void queryClient.invalidateQueries();
  }, [queryClient]);

  const signOut = useCallback(async () => {
    setActionError(null);
    try {
      await signOutSession();
      setNeedsLogin(false);
      await queryClient.cancelQueries();
      queryClient.clear();
    } catch {
      setActionError("Chưa thể đăng xuất trên máy chủ. Vui lòng kiểm tra mạng và thử lại.");
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => ({
    accessToken: session?.accessToken ?? null, user, isRestoring, restoreError,
    retryRestore: () => { void restore(); }, signIn, signOut,
    can: (permission) => Boolean(user?.permissions.includes(permission)),
  }), [session, user, isRestoring, restoreError, restore, signIn, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {actionError && !needsLogin && <p role="alert" className="bg-destructive p-3 text-center text-sm text-destructive-foreground">{actionError}</p>}
      {children}
      {needsLogin && user && <ReauthDialog email={user.email} rememberDevice={session?.rememberDevice ?? false} error={actionError} onLogin={signIn} onSignOut={signOut} />}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
