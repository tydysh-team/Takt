// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { ApiError, getAccessToken, setAccessToken } from "../api/client";
import type { CurrentUser } from "../api/types";
import { AuthContext } from "../features/auth/auth-context";
import { LoginPage } from "./LoginPage";

const user: CurrentUser = {
  id: "8f87f4b3-30ce-4fce-baf0-402ca849edc9",
  email: "teacher@example.com",
  role: "TEACHER",
  first_name: "Ada",
  last_name: "Lovelace",
  middle_name: null,
};

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
}

function renderLogin(verifyMfaLogin: (payload: { challenge: string; code: string }) => Promise<CurrentUser>) {
  const login = vi.fn(() => Promise.resolve({ mfa_required: true as const, challenge: "memory-only-challenge" }));
  render(<AuthContext.Provider value={{
    status: "unauthenticated", user: null, login, verifyMfaLogin,
    register: vi.fn(), logout: vi.fn(), endSession: vi.fn(), updateCurrentUser: vi.fn(),
  }}><MemoryRouter initialEntries={["/login"]}><LoginPage /><LocationProbe /></MemoryRouter></AuthContext.Provider>);
  return login;
}

async function enterPasswordStep() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "teacher@example.com" } });
  fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "StrongPass!123" } });
  fireEvent.click(screen.getByRole("button", { name: "Войти" }));
  await screen.findByLabelText("Код из приложения");
}

afterEach(() => {
  cleanup();
  setAccessToken(null);
});

describe("login with MFA", () => {
  it("stays on login until a second factor is verified", async () => {
    const verify = vi.fn(() => Promise.resolve(user));
    renderLogin(verify);
    await enterPasswordStep();
    expect(screen.getByTestId("path").textContent).toBe("/login");
    expect(getAccessToken()).toBeNull();
    fireEvent.change(screen.getByLabelText("Код из приложения"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить вход" }));
    await waitFor(() => { expect(verify).toHaveBeenCalledWith({ challenge: "memory-only-challenge", code: "123456" }); });
    await waitFor(() => { expect(screen.getByTestId("path").textContent).toBe("/dashboard"); });
  });

  it("returns to password entry after an expired challenge", async () => {
    const verify = vi.fn((): Promise<CurrentUser> =>
      Promise.reject(new ApiError("mfa_challenge_invalid", "Истёк срок подтверждения", 401)));
    renderLogin(verify);
    await enterPasswordStep();
    fireEvent.click(screen.getByRole("button", { name: "Использовать резервный код" }));
    fireEvent.change(screen.getByLabelText("Резервный код"), { target: { value: "ABCDEF123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить вход" }));
    await screen.findByLabelText("Пароль");
    expect(screen.getByTestId("path").textContent).toBe("/login");
    expect(getAccessToken()).toBeNull();
  });
});
