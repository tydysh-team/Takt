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
import { ProfilePage } from "./ProfilePage";
import { RegisterPage } from "./RegisterPage";

function renderPage(page: React.ReactNode, queryClient = new QueryClient()): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>{page}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("registration and profile pages", () => {
  it("does not render timezone during registration", () => {
    const html = renderPage(<RegisterPage />);

    expect(html).not.toContain("Часовой пояс");
    expect(html).toContain("От 8 до 128 символов");
  });

  it("keeps the timezone selector in profile editing", () => {
    const queryClient = new QueryClient();
    const profile: Profile = {
      first_name: "Ada",
      last_name: "Lovelace",
      middle_name: null,
      email: "ada@example.com",
      role: "TEACHER",
      bio: null,
      timezone: "Europe/Moscow",
    };
    queryClient.setQueryData(queryKeys.profile, profile);

    const html = renderPage(<ProfilePage />, queryClient);

    expect(html).toContain("Часовой пояс");
    expect(html).not.toContain("Поиск часового пояса");
    expect(html).toContain("Europe/Samara");
  });
});
