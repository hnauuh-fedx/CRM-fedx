import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/services/api";
import { getCurrentUser, login } from "@/services/auth.service";
import type { AuthUser, LoginInput } from "@/types/auth";
import { clearAccessToken, persistAccessToken, readAccessToken } from "./auth-storage";

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  isRestoring: boolean;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => void;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(() => readAccessToken());
  const [signedInUser, setSignedInUser] = useState<AuthUser | null>(null);
  const profileQuery = useQuery({
    queryKey: ["auth", "me", accessToken],
    queryFn: () => getCurrentUser(accessToken!),
    enabled: Boolean(accessToken),
  });

  useEffect(() => {
    if (profileQuery.error instanceof ApiError && profileQuery.error.status === 401) {
      clearAccessToken();
      setAccessToken(null);
      setSignedInUser(null);
    }
  }, [profileQuery.error]);

  const user = profileQuery.data?.user ?? signedInUser;

  async function signIn(input: LoginInput) {
    const session = await login(input);
    persistAccessToken(session.accessToken, input.rememberDevice);
    setAccessToken(session.accessToken);
    setSignedInUser(session.user);
    queryClient.setQueryData(["auth", "me", session.accessToken], { user: session.user });
  }

  function signOut() {
    clearAccessToken();
    setAccessToken(null);
    setSignedInUser(null);
    queryClient.removeQueries({ queryKey: ["auth"] });
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      user,
      isRestoring: Boolean(accessToken) && !user && profileQuery.isLoading,
      signIn,
      signOut,
      can: (permission) => Boolean(user?.permissions.includes(permission)),
    }),
    [accessToken, profileQuery.isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
