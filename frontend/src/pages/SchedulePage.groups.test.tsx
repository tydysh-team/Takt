// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../shared/config/environment", () => ({ environment: { apiBaseUrl: "http://api.example" } }));

import { api, queryKeys } from "../api/queries";
import type { CurrentUser, LessonReadDTO } from "../api/types";
import { AuthContext } from "../features/auth/auth-context";
import { SchedulePage } from "./SchedulePage";
import { ApiError } from "../api/client";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(role: "TEACHER" | "STUDENT") {
  const user: CurrentUser = { id: role === "TEACHER" ? "teacher" : "a", role, email: "viewer@example.com",
    first_name: "Viewer", last_name: "Example", middle_name: null };
  const today = new Date();
  today.setUTCHours(10, 0, 0, 0);
  const lesson: LessonReadDTO = {
    id: "group", title: "Групповая алгебра", description: "Описание", starts_at: today.toISOString(),
    ends_at: new Date(today.getTime() + 3600_000).toISOString(), duration_minutes: 60,
    status: "in_progress", attendance: role === "STUDENT" ? "present" : "not_set",
    is_rescheduled: false, cancellation_reason: null, student: null, participant_count: 2,
    teacher: { id: "teacher", first_name: "Иван", last_name: "Учитель", middle_name: null },
    participants: role === "TEACHER" ? [
      { id: "a", first_name: "Анна", last_name: "Петрова", middle_name: null, attendance: "present" },
      { id: "b", first_name: "Борис", last_name: "Иванов", middle_name: null, attendance: "absent" },
    ] : [],
  };
  vi.spyOn(api, "searchLessons").mockResolvedValue([lesson]);
  vi.spyOn(api, "lesson").mockResolvedValue(role === "TEACHER" ? lesson : {
    ...lesson, participants: [
      { first_name: "Анна", last_name: "Петрова", is_self: true },
      { first_name: "Борис", last_name: "Иванов", is_self: false },
    ],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(queryKeys.profile, { timezone: "UTC" });
  client.setQueryData(queryKeys.teacherStudents, [
    { id: "a", first_name: "Анна", last_name: "Петрова", middle_name: null },
    { id: "b", first_name: "Борис", last_name: "Иванов", middle_name: null },
  ]);
  const result = render(<AuthContext.Provider value={{ status: "authenticated", user,
    login: vi.fn(), verifyMfaLogin: vi.fn(), register: vi.fn(), logout: vi.fn(),
    endSession: vi.fn(), updateCurrentUser: vi.fn(),
  }}><QueryClientProvider client={client}><MemoryRouter><SchedulePage /></MemoryRouter></QueryClientProvider></AuthContext.Provider>);
  return { ...result, lesson, client };
}

it.each(["TEACHER", "STUDENT"] as const)("renders one group card and role-specific details for %s", async (role) => {
  const { container } = setup(role);
  await waitFor(() => { expect(container.querySelectorAll(".schedule-event")).toHaveLength(1); });
  const card = container.querySelector(".schedule-event")!;
  expect(card.textContent).toContain(role === "TEACHER" ? "2 ученика" : "Групповое занятие");
  expect(card.textContent).not.toContain("Борис Иванов");
  if (role === "STUDENT") expect(card.textContent).toContain("Иван Учитель");
  fireEvent.click(card);
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByText(role === "TEACHER" ? "Анна Петрова" : "Анна Петрова — Вы")).toBeTruthy();
  expect(within(dialog).getByText("Борис Иванов")).toBeTruthy();
  if (role === "STUDENT") {
    expect(within(dialog).getByText("Присутствовал")).toBeTruthy();
    expect(within(dialog).queryByText("Отсутствовал")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Не отмечено" })).toBeNull();
    expect(within(dialog).queryAllByRole("link")).toHaveLength(0);
  } else {
    expect(within(dialog).getAllByRole("button", { name: "Не отмечено" })).toHaveLength(2);
  }
  fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
  fireEvent.click(screen.getByRole("button", { name: "Список" }));
  await waitFor(() => { expect(container.querySelectorAll(".lesson-card")).toHaveLength(1); });
  expect(container.querySelector(".lesson-card")?.textContent).toContain(role === "TEACHER" ? "2 ученика" : "Групповое занятие");
  expect(container.querySelector(".lesson-card")?.textContent).not.toContain("Борис Иванов");
});

it("shows every blocking participant and keeps the group draft without confirmation", async () => {
  setup("TEACHER");
  const create = vi.spyOn(api, "createLesson").mockRejectedValue(new ApiError(
    "student_schedule_conflict", "Занято", 409, [], { conflicts: [
      { student_id: "a", student_name: "Анна Петрова", starts_at: "2035-03-15T12:00:00Z", ends_at: "2035-03-15T13:00:00Z" },
      { student_id: "b", student_name: "Борис Иванов", starts_at: "2035-03-15T12:30:00Z", ends_at: "2035-03-15T13:30:00Z" },
    ] },
  ));
  fireEvent.click(screen.getByRole("button", { name: /Создать занятие/ }));
  fireEvent.click(screen.getByRole("button", { name: "Групповое" }));
  fireEvent.click(screen.getByRole("button", { name: /Участники: выбрано/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Анна Петрова" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Борис Иванов" }));
  fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Новая группа" } });
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "15.03.2035" } });
  fireEvent.change(screen.getByLabelText("Время"), { target: { value: "12:30" } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Создать занятие" }));
  await waitFor(() => { expect(create).toHaveBeenCalledWith(expect.objectContaining({ student_ids: ["a", "b"], confirm_conflict: false })); });
  expect(create.mock.calls[0]?.[0]).not.toHaveProperty("student_id");
  expect(await screen.findByText(/Занято: Анна Петрова:/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Участники: выбрано 2" })).toBeTruthy();
  expect((screen.getByLabelText("Название") as HTMLInputElement).value).toBe("Новая группа");
  expect(screen.queryByText("Создать несмотря на конфликт")).toBeNull();
});
