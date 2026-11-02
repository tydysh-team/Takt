import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { ApiError, getAccessToken, readableError, setAccessToken } from "../../api/client";
import { LoginPage } from "../../pages/LoginPage";
import { AuthProvider } from "./AuthProvider";
import { authApi } from "./auth-api";
import { clearAuthClientState } from "./auth-session";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { changePasswordSchema } from "./change-password-schema";
import { changePasswordAndSignOut } from "./password-change-flow";

afterEach(() => {
  setAccessToken(null);
  vi.restoreAllMocks();
});

describe("password change", () => {
  it("validates length, confirmation, and a different new password", () => {
    const valid = { current_password: "old-password", new_password: "new-password", confirm_password: "new-password" };
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...valid, new_password: "short", confirm_password: "short" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...valid, confirm_password: "different" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...valid, new_password: "old-password", confirm_password: "old-password" }).success).toBe(false);
  });

  it("renders all password fields, the policy, and the visibility control", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider><MemoryRouter><ChangePasswordForm /></MemoryRouter></AuthProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain('name="current_password"');
    expect(html).toContain('name="new_password"');
    expect(html).toContain('name="confirm_password"');
    expect(html).toContain("от 8 до 128 символов");
    expect(html).toContain("Показать пароли");
    expect(html).toContain("Сменить пароль");
  });

  it("shows the re-login message after a password change", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <MemoryRouter initialEntries={[{ pathname: "/login", state: { passwordChanged: true } }]}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("Пароль изменён. Войдите заново");
  });

  it("clears the form and session and opens login only after a successful response", async () => {
    const change = vi.spyOn(authApi, "changePassword").mockResolvedValue(undefined);
    const events: string[] = [];
    await changePasswordAndSignOut(
      { current_password: "old-password", new_password: "new-password" },
      () => { events.push("clear-form"); },
      () => { events.push("end-session"); },
      () => { events.push("login"); },
    );
    expect(change).toHaveBeenCalledOnce();
    expect(events).toEqual(["clear-form", "end-session", "login"]);
  });

  it("keeps the session on backend error and maps the error to a readable message", async () => {
    const error = new ApiError("current_password_invalid", "Wrong password", 400);
    vi.spyOn(authApi, "changePassword").mockRejectedValue(error);
    const clearForm = vi.fn();
    const endSession = vi.fn();
    const goToLogin = vi.fn();
    await expect(changePasswordAndSignOut(
      { current_password: "wrong", new_password: "new-password" },
      clearForm, endSession, goToLogin,
    )).rejects.toBe(error);
    expect(readableError(error)).toBe("Неверный текущий пароль.");
    expect(clearForm).not.toHaveBeenCalled();
    expect(endSession).not.toHaveBeenCalled();
    expect(goToLogin).not.toHaveBeenCalled();
  });

  it("removes the access token and cached user data on session end", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["profile"], { email: "teacher@example.com" });
    setAccessToken("old-access-token");
    clearAuthClientState(queryClient);
    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(["profile"])).toBeUndefined();
  });
});
