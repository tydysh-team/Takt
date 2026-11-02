import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { queryKeys } from "../api/queries";
import type { Profile } from "../api/types";
import { AuthProvider } from "../features/auth/AuthProvider";
import { statusKey } from "../features/auth/mfa-status";
import { ProfilePage } from "./ProfilePage";

const profile: Profile = {
  first_name: "Ada",
  last_name: "Lovelace",
  middle_name: null,
  email: "ada@example.com",
  role: "ADMIN",
  bio: null,
  timezone: "Europe/Moscow",
};

function renderSecurity(path: string, enabled: boolean): string {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.profile, profile);
  queryClient.setQueryData(statusKey, { enabled });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}><ProfilePage /></MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("security navigation", () => {
  it("shows two cards without opening the password form", () => {
    const html = renderSecurity("/profile/security", false);
    expect(html).toContain("Смена пароля");
    expect(html).toContain("Двухфакторная аутентификация");
    expect(html).toContain("Не подключена");
    expect(html).toContain('href="/profile/security/password"');
    expect(html).toContain('href="/profile/security/2fa"');
    expect(html).not.toContain("Подтверждение нового пароля");
  });

  it("opens the existing password form with a back link", () => {
    const html = renderSecurity("/profile/security/password", false);
    expect(html).toContain("Назад к безопасности");
    expect(html).toContain("Подтверждение нового пароля");
    expect(html).toContain('href="/profile/security"');
  });

  it("opens enabled 2FA management from the backend-derived status", () => {
    const html = renderSecurity("/profile/security/2fa", true);
    expect(html).toContain("Включена");
    expect(html).toContain("Перевыпустить резервные коды");
    expect(html).toContain("Отключить 2FA");
    expect(html).not.toContain("otpauth://");
  });
});
