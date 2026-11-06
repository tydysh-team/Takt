// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { api, queryKeys } from "../api/queries";
import { ApiError } from "../api/client";
import type { CurrentUser, PersonScheduleItem } from "../api/types";
import { AuthContext } from "../features/auth/auth-context";
import { SchedulePage } from "./SchedulePage";

const teacher: CurrentUser = {
  id: "teacher-current", email: "teacher@example.com", role: "TEACHER",
  first_name: "Иван", last_name: "Иванов", middle_name: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("selected person's calendar", () => {
  it("shows a private busy card without actions and refetches after week navigation", async () => {
    const today = new Date();
    today.setUTCHours(10, 0, 0, 0);
    const later = new Date(today.getTime() + 2 * 60 * 60_000);
    const items: PersonScheduleItem[] = [
      {
        type: "lesson", id: "shared", title: "Общий урок", description: null,
        starts_at: today.toISOString(), ends_at: new Date(today.getTime() + 60 * 60_000).toISOString(),
        duration_minutes: 60, status: "planned", is_rescheduled: false,
        attendance: "not_set", cancellation_reason: null,
        teacher: { id: teacher.id, first_name: "Иван", last_name: "Иванов", middle_name: null },
        student: { id: "student-selected", first_name: "Анна", last_name: "Петрова", middle_name: null },
      },
      {
        type: "busy", starts_at: later.toISOString(),
        ends_at: new Date(later.getTime() + 60 * 60_000).toISOString(),
      },
    ];
    const personSchedule = vi.spyOn(api, "personSchedule").mockResolvedValue(items);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(queryKeys.profile, { timezone: "UTC" });
    queryClient.setQueryData(queryKeys.teacherStudents, []);
    const { container } = render(
      <AuthContext.Provider value={{
        status: "authenticated", user: teacher, login: vi.fn(), verifyMfaLogin: vi.fn(),
        register: vi.fn(), logout: vi.fn(), endSession: vi.fn(), updateCurrentUser: vi.fn(),
      }}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter><SchedulePage viewedStudent={{ id: "student-selected", name: "Анна Петрова" }} /></MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
    );
    await screen.findByText("Общий урок");
    const busy = container.querySelector(".schedule-event--busy");
    expect(busy).not.toBeNull();
    expect(busy?.textContent).toContain("Занят");
    expect(busy?.getAttribute("role")).toBeNull();
    fireEvent.click(busy!);
    expect(screen.queryByText("Перенести…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Следующая неделя" }));
    await waitFor(() => expect(personSchedule).toHaveBeenCalledTimes(2));
    const firstRange = personSchedule.mock.calls[0]?.[1];
    const secondRange = personSchedule.mock.calls[1]?.[1];
    expect(firstRange?.date_from).not.toBe(secondRange?.date_from);
  });

  it("keeps loading and access-error states for a selected person", async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    vi.spyOn(api, "personSchedule").mockImplementation(() => new Promise<PersonScheduleItem[]>((_resolve, reject) => {
      rejectRequest = reject;
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(queryKeys.profile, { timezone: "UTC" });
    queryClient.setQueryData(queryKeys.teacherStudents, []);
    render(<AuthContext.Provider value={{
      status: "authenticated", user: teacher, login: vi.fn(), verifyMfaLogin: vi.fn(),
      register: vi.fn(), logout: vi.fn(), endSession: vi.fn(), updateCurrentUser: vi.fn(),
    }}><QueryClientProvider client={queryClient}>
      <MemoryRouter><SchedulePage viewedStudent={{ id: "student-selected", name: "Анна Петрова" }} /></MemoryRouter>
    </QueryClientProvider></AuthContext.Provider>);
    expect(screen.getByText("Загружаем расписание…")).not.toBeNull();
    await waitFor(() => expect(rejectRequest).toBeDefined());
    rejectRequest?.(new ApiError("connection_not_found", "Активная связь не найдена.", 404));
    expect(await screen.findByText("Активная связь не найдена.")).not.toBeNull();
  });
});
