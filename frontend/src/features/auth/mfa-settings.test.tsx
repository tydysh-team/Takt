// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

const mocks = vi.hoisted(() => ({
  status: vi.fn(() => Promise.resolve({ enabled: false })),
  start: vi.fn(() => Promise.resolve({
    secret: "JBSWY3DPEHPK3PXP",
    provisioning_uri: "otpauth://totp/Takt:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Takt",
    expires_in: 600,
  })),
  confirm: vi.fn(() => Promise.resolve({ backup_codes: Array.from({ length: 10 }, (_, index) => `BACKUPCODE${String(index)}`) })),
  disable: vi.fn(() => Promise.resolve(undefined)),
  regenerate: vi.fn(() => Promise.resolve({ backup_codes: Array.from({ length: 10 }, (_, index) => `NEWCODE${String(index)}`) })),
  qr: vi.fn(() => Promise.resolve("data:image/png;base64,abc")),
}));

vi.mock("./mfa-api", () => ({ mfaApi: mocks }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qr } }));

import { AuthContext } from "./auth-context";
import { MfaSettings } from "./MfaSettings";
import { statusKey } from "./mfa-status";

const endSession = vi.fn();

function renderSettings(enabled: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(statusKey, { enabled });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{
        status: "authenticated", user: null, login: vi.fn(), verifyMfaLogin: vi.fn(),
        register: vi.fn(), logout: vi.fn(), endSession, updateCurrentUser: vi.fn(),
      }}>
        <MemoryRouter><MfaSettings /></MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("2FA settings wizard", () => {
  it("shows a local QR, manual secret, confirms and displays one-time backup codes", async () => {
    renderSettings(false);
    expect(screen.getByText(/Не подключена/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Подключить Authenticator" }));
    fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: "current-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeDefined();
    const qr = await screen.findByAltText("QR-код для настройки Authenticator");
    expect(qr.getAttribute("src")).toBe("data:image/png;base64,abc");
    expect(mocks.qr).toHaveBeenCalledWith(expect.stringContaining("otpauth://"), expect.any(Object));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.change(screen.getByLabelText("Код Authenticator"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Подключить 2FA" }));
    expect(await screen.findByText("BACKUPCODE0")).toBeDefined();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.queryByText("JBSWY3DPEHPK3PXP")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Я сохранил коды" }));
    expect(endSession).toHaveBeenCalledOnce();
    expect(screen.queryByText("BACKUPCODE0")).toBeNull();
  });

  it("keeps the setup step after an invalid code", async () => {
    mocks.confirm.mockRejectedValueOnce(new Error("Неверный код"));
    renderSettings(false);
    fireEvent.click(screen.getByRole("button", { name: "Подключить Authenticator" }));
    fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: "current-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    await screen.findByText("JBSWY3DPEHPK3PXP");
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.change(screen.getByLabelText("Код Authenticator"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Подключить 2FA" }));
    await waitFor(() => { expect(mocks.confirm).toHaveBeenCalledOnce(); });
    expect(screen.getByLabelText("Код Authenticator")).toBeDefined();
  });

  it("requires password and code when disabling enabled 2FA", async () => {
    renderSettings(true);
    fireEvent.click(screen.getByRole("button", { name: "Отключить 2FA" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Текущий пароль"), { target: { value: "current-pass" } });
    fireEvent.change(within(dialog).getByLabelText("Код"), { target: { value: "123456" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Отключить 2FA" }));
    await waitFor(() => { expect(mocks.disable).toHaveBeenCalledWith("current-pass", "123456"); });
    expect(endSession).toHaveBeenCalledOnce();
  });

  it("reissues backup codes only after password and code confirmation", async () => {
    renderSettings(true);
    fireEvent.click(screen.getByRole("button", { name: "Перевыпустить резервные коды" }));
    fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: "current-pass" } });
    fireEvent.change(screen.getByLabelText("Код Authenticator или резервный код"), { target: { value: "ABCDEF123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Перевыпустить коды" }));
    expect(await screen.findByText("NEWCODE0")).toBeDefined();
    expect(mocks.regenerate).toHaveBeenCalledWith("current-pass", "ABCDEF123456");
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });
});
