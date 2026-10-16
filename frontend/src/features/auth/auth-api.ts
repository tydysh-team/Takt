import { apiRequest } from "../../api/client";
import type {
  AccessTokenResponse,
  CurrentUser,
  LoginPayload,
  RegisterPayload,
  RegisterResponse,
} from "../../api/types";

export const authApi = {
  currentUser: () =>
    apiRequest<CurrentUser>("/api/v1/me", { retryAfterRefresh: false }),
  login: (payload: LoginPayload) =>
    apiRequest<AccessTokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: payload,
      authenticated: false,
      retryAfterRefresh: false,
    }),
  register: (payload: RegisterPayload) =>
    apiRequest<RegisterResponse>("/api/v1/auth/register", {
      method: "POST",
      body: payload,
      authenticated: false,
      retryAfterRefresh: false,
    }),
  logout: () =>
    apiRequest<undefined>("/api/v1/auth/logout", {
      method: "POST",
      authenticated: false,
      retryAfterRefresh: false,
      csrf: true,
    }),
};
