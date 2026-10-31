import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { queryKeys } from "../api/queries";
import type { TeacherListItem } from "../api/types";
import { TeacherDetailPage } from "./TeacherDetailPage";

function renderTeacher(bio: string | null): string {
  const queryClient = new QueryClient();
  const teacher: TeacherListItem = {
    id: "teacher-id",
    first_name: "Иван",
    last_name: "Иванов",
    email: "teacher@example.com",
    timezone: "Europe/Moscow",
    connected_at: "2030-01-01T10:00:00Z",
    bio,
  };
  queryClient.setQueryData(queryKeys.teacher(teacher.id), teacher);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/teachers/${teacher.id}`]}>
        <Routes><Route path="/teachers/:id" element={<TeacherDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("student teacher detail", () => {
  it("shows the stored bio and keeps all three tabs", () => {
    const html = renderTeacher("Преподаю математику");
    expect(html).toContain("Преподаю математику");
    expect(html).toContain("Основное");
    expect(html).toContain("Расписание");
    expect(html).toContain("Домашние задания");
  });

  it.each([null, "", "  "])("shows the existing placeholder for empty bio %s", (bio) => {
    expect(renderTeacher(bio)).toContain("Преподаватель пока не добавил описание.");
  });
});
