// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: { id: "me", first_name: "Анна", last_name: "Петрова", middle_name: null, role: "TEACHER" as const, email: "me@example.com" },
  logout: vi.fn(),
}));
vi.mock("../features/auth/auth-context", () => ({ useAuth: () => auth }));
vi.mock("./ThemeToggle", () => ({ ThemeToggle: () => <button type="button">Тема</button> }));

import { AppShell } from "./AppShell";

afterEach(cleanup);

function setup(path = "/schedule") {
  const view = render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<AppShell />}>
      <Route path="/schedule" element={<p>Расписание страницы</p>} />
      <Route path="/homework" element={<p>Задания страницы</p>} />
      <Route path="/profile" element={<p>Собственный профиль</p>} />
    </Route>
  </Routes></MemoryRouter>);
  return { ...view, header: view.container.querySelector<HTMLElement>(".workspace__topbar")! };
}

it.each(["name", "avatar"])("opens the existing own profile through the header %s", async (target) => {
  const { header } = setup();
  const location = window.location.href;
  const link = within(header).getByRole("link", { name: target === "avatar" ? "Открыть свой профиль" : "Анна Петрова" });
  expect(link.getAttribute("href")).toBe("/profile");
  if (target === "avatar") fireEvent.click(link.querySelector(".avatar")!);
  else fireEvent.click(link);
  expect(await screen.findByText("Собственный профиль")).toBeTruthy();
  expect(window.location.href).toBe(location);
});

it("keeps the profile links keyboard accessible on another page with the common header", async () => {
  const { header } = setup("/homework");
  const link = within(header).getByRole("link", { name: "Открыть свой профиль" });
  link.focus();
  expect(document.activeElement).toBe(link);
  expect(link.tabIndex).toBe(0);
  fireEvent.keyDown(link, { key: "Enter" });
  // jsdom does not synthesize the browser's default keyboard click on anchors.
  fireEvent.click(link, { detail: 0 });
  expect(await screen.findByText("Собственный профиль")).toBeTruthy();
});
