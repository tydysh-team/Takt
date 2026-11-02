import { z } from "zod";

import { ApiError, apiRequest } from "../../api/client";
import type {
  AccessTokenResponse,
  CurrentUser,
  LoginPayload,
  RegisterPayload,
  RegisterResponse,
} from "../../api/types";

const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: z.enum(["TEACHER", "STUDENT", "ADMIN"]),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  middle_name: z.string().nullable(),
});

export const authApi = {
  currentUser: async (): Promise<CurrentUser> => {
    const payload = await apiRequest<unknown>("/me", { retryAfterRefresh: false });
    const result = currentUserSchema.safeParse(payload);
    if (!result.success) {
      throw new ApiError(
        "invalid_response",
        "Некорректный ответ сервера. Попробуйте войти снова.",
        200,
      );
    }
    return result.data;
  },
  login: (payload: LoginPayload) =>
    apiRequest<AccessTokenResponse | { mfa_required: true; challenge: string; expires_in: number }>("/auth/login", {
      method: "POST",
      body: payload,
      authenticated: false,
      retryAfterRefresh: false,
    }),
  verifyMfaLogin: (payload: { challenge: string; code: string }) =>
    apiRequest<AccessTokenResponse>("/auth/mfa/verify", {
      method: "POST",
      body: payload,
      authenticated: false,
      retryAfterRefresh: false,
    }),
  register: (payload: RegisterPayload) =>
    apiRequest<RegisterResponse>("/auth/register", {
      method: "POST",
      body: payload,
      authenticated: false,
      retryAfterRefresh: false,
    }),
  logout: () =>
    apiRequest<undefined>("/auth/logout", {
      method: "POST",
      authenticated: false,
      retryAfterRefresh: false,
      csrf: true,
    }),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    apiRequest<undefined>("/auth/change-password", {
      method: "POST",
      body: payload,
      csrf: true,
    }),
};
