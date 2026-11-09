// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));
vi.mock("./SchedulePage", () => ({
  SchedulePage: ({ viewedTeacher, viewedStudent }: {
    viewedTeacher?: { id: string; name: string };
    viewedStudent?: { id: string; name: string };
  }) => <div data-testid="linked-schedule">{viewedTeacher?.id ?? viewedStudent?.id}</div>,
}));

import { queryKeys } from "../api/queries";
import type { StudentDetail, TeacherListItem } from "../api/types";
import { StudentDetailPage } from "./StudentDetailPage";
import { TeacherDetailPage } from "./TeacherDetailPage";

afterEach(cleanup);

function renderDetail(role: "teacher" | "student") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (role === "teacher") {
    const student: StudentDetail = {
      id: "student-id", first_name: "Анна", last_name: "Петрова",
      email: "student@example.com", timezone: "UTC",
      connection: { status: "ACTIVE", connected_at: "2030-01-01T10:00:00Z", teacher_note: null },
    };
    queryClient.setQueryData(queryKeys.student(student.id), student);
  } else {
    const teacher: TeacherListItem = {
      id: "teacher-id", first_name: "Иван", last_name: "Иванов",
      email: "teacher@example.com", timezone: "UTC",
      connected_at: "2030-01-01T10:00:00Z", bio: null,
    };
    queryClient.setQueryData(queryKeys.teacher(teacher.id), teacher);
  }
  const route = role === "teacher" ? "/students/student-id" : "/teachers/teacher-id";
  render(<QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/students/:id" element={<StudentDetailPage />} />
        <Route path="/teachers/:id" element={<TeacherDetailPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

describe("linked schedule navigation", () => {
  it("opens the selected student's schedule from the student card", () => {
    renderDetail("teacher");
    fireEvent.click(screen.getByRole("tab", { name: "Расписание" }));
    expect(screen.getByTestId("linked-schedule").textContent).toBe("student-id");
  });

  it("opens the selected teacher's schedule from the teacher card", () => {
    renderDetail("student");
    fireEvent.click(screen.getByRole("tab", { name: "Расписание" }));
    expect(screen.getByTestId("linked-schedule").textContent).toBe("teacher-id");
  });
});
