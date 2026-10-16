import { createContext, useContext } from "react";

import type {
  CurrentUser,
  LoginPayload,
  RegisterPayload,
  RegisterResponse,
} from "../../api/types";

export type SessionStatus = "bootstrapping" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: SessionStatus;
  user: CurrentUser | null;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  updateCurrentUser: (user: CurrentUser) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
