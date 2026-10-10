import { useQueryClient } from "@tanstack/react-query";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  apiRequest,
  onSessionExpired,
  refreshAccessToken,
  setAccessToken,
} from "../../api/client";
import type {
  AccessTokenResponse,
  CurrentUser,
  LoginPayload,
  RegisterPayload,
  RegisterResponse,
} from "../../api/types";
import { AuthContext, type AuthContextValue, type SessionStatus } from "./auth-context";

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>("bootstrapping");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const bootstrapStarted = useRef(false);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
    queryClient.clear();
  }, [queryClient]);

  const loadCurrentUser = useCallback(async () => {
    const currentUser = await apiRequest<CurrentUser>("/api/v1/auth/me", {
      retryAfterRefresh: false,
    });
    setUser(currentUser);
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    onSessionExpired(clearSession);
    return () => { onSessionExpired(null); };
  }, [clearSession]);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;

    void refreshAccessToken()
      .then(loadCurrentUser)
      .catch(() => { clearSession(); });
  }, [clearSession, loadCurrentUser]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      queryClient.clear();
      const token = await apiRequest<AccessTokenResponse>("/api/v1/auth/login", {
        method: "POST",
        body: payload,
        authenticated: false,
        retryAfterRefresh: false,
      });
      setAccessToken(token.access_token);
      try {
        await loadCurrentUser();
      } catch (error) {
        clearSession();
        throw error;
      }
    },
    [clearSession, loadCurrentUser, queryClient],
  );

  const register = useCallback((payload: RegisterPayload) => {
    return apiRequest<RegisterResponse>("/api/v1/auth/register", {
      method: "POST",
      body: payload,
      authenticated: false,
      retryAfterRefresh: false,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<undefined>("/api/v1/auth/logout", {
        method: "POST",
        authenticated: false,
        retryAfterRefresh: false,
        csrf: true,
      });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, updateCurrentUser: setUser }),
    [status, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
