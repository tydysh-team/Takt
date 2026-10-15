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
  onSessionExpired,
  refreshAccessToken,
  setAccessToken,
} from "../../api/client";
import type { CurrentUser, LoginPayload, RegisterPayload } from "../../api/types";
import { authApi } from "./auth-api";
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
    const currentUser = await authApi.currentUser();
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
      const token = await authApi.login(payload);
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
    return authApi.register(payload);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
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
