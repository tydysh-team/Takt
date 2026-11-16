// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { ProgressPeriod } from "../api/types";

vi.mock("../shared/config/environment", () => ({ environment: { apiBaseUrl: "http://api.example" } }));
vi.mock("./SchedulePage", () => ({ SchedulePage: () => <div>Расписание</div> }));
vi.mock("../features/progress/StudentProgressPanel", () => ({
  StudentProgressPanel: ({ period, onPeriodChange, onOpenHomework, onOpenHistory }: {
    period: ProgressPeriod;
    onPeriodChange: (next: ProgressPeriod) => void;
    onOpenHomework: () => void;
    onOpenHistory: () => void;
  }) => <div>
    <output data-testid="summary-period">{period.date_from}|{period.date_to}</output>
    <button onClick={() => { onPeriodChange({ date_from: "2026-04-30T20:00:00Z", date_to: "2026-05-31T20:00:00Z" }); }}>Другой период</button>
    <button onClick={onOpenHomework}>Открыть задания</button>
    <button onClick={onOpenHistory}>Открыть историю</button>
  </div>,
}));
vi.mock("../features/progress/StudentHistoryPanel", () => ({
  StudentHistoryPanel: ({ period }: { period: ProgressPeriod }) =>
    <output data-testid="history-period">{period.date_from}|{period.date_to}</output>,
}));
vi.mock("../features/homework/HomeworkPanel", () => ({
  HomeworkPanel: ({ period }: { period: ProgressPeriod | null }) =>
    <output data-testid="homework-period">{period?.date_from}|{period?.date_to}</output>,
}));

import { queryKeys } from "../api/queries";
import type { StudentDetail } from "../api/types";
import { StudentDetailPage } from "./StudentDetailPage";

const first = "2026-03-31T20:00:00Z|2026-04-30T20:00:00Z";
const next = "2026-04-30T20:00:00Z|2026-05-31T20:00:00Z";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderStudentDetail(search: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const student: StudentDetail = {
    id: "student-id", first_name: "Анна", last_name: "Петрова",
    email: "student@example.com", timezone: "Europe/Samara",
    connection: { status: "ACTIVE", connected_at: "2026-01-01T10:00:00Z", teacher_note: null },
  };
  client.setQueryData(queryKeys.student(student.id), student);
  client.setQueryData(queryKeys.profile, { timezone: "Europe/Samara" });
  render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[`/students/student-id${search}`]}>
      <LocationProbe />
      <Routes><Route path="/students/:id" element={<StudentDetailPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

afterEach(cleanup);

describe("student statistics navigation", () => {
  it("keeps the selected period across summary, history, homework, and URL navigation", () => {
    renderStudentDetail("?date_from=2026-03-31T20%3A00%3A00Z&date_to=2026-04-30T20%3A00%3A00Z");
    fireEvent.click(screen.getByRole("tab", { name: "Прогресс" }));
    expect(screen.getByTestId("summary-period").textContent).toBe(first);
    fireEvent.click(screen.getByRole("button", { name: "Другой период" }));
    expect(screen.getByTestId("summary-period").textContent).toBe(next);
    expect(screen.getByTestId("location").textContent).toContain("date_to=2026-05-31T20%3A00%3A00Z");
    fireEvent.click(screen.getByRole("button", { name: "Открыть историю" }));
    expect(screen.getByTestId("history-period").textContent).toBe(next);
    fireEvent.click(screen.getByRole("tab", { name: "Прогресс" }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть задания" }));
    expect(screen.getByTestId("homework-period").textContent).toBe(next);
    fireEvent.click(screen.getByRole("tab", { name: "Прогресс" }));
    expect(screen.getByTestId("summary-period").textContent).toBe(next);
  });
});
