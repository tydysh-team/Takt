import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "TEACHER" }));
vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ user: { role: state.role } }) }));
vi.mock("../../shared/config/environment", () => ({
  environment: { apiBaseUrl: "http://api.example" },
}));

import { queryKeys } from "../../api/queries";
import type { Homework, HomeworkPage } from "../../api/types";
import { HomeworkPanel } from "./HomeworkPanel";

function item(id: string, status: string): Homework {
  return {
    id,
    teacher_id: "teacher-1",
    teacher_name: "Иван Иванов",
    student_id: "student-1",
    student_name: "Анна Петрова",
    title: `Задание ${id}`,
    description: null,
    due_at: "2030-01-01T12:00:00Z",
    status,
    is_overdue: false,
    created_at: "2030-01-01T12:00:00Z",
    attachments: [],
  };
}

function render(role: "TEACHER" | "STUDENT", items: Homework[]): string {
  state.role = role;
  const client = new QueryClient();
  const page: HomeworkPage = { items, total: items.length, limit: 20, offset: 0 };
  client.setQueryData(queryKeys.homework(role, undefined, 0), page);
  client.setQueryData(queryKeys.profile, {
    first_name: "Иван",
    last_name: "Иванов",
    middle_name: null,
    email: "teacher@example.com",
    role,
    bio: null,
    timezone: "Europe/Moscow",
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><HomeworkPanel /></QueryClientProvider>,
  );
}

describe("homework summary progress", () => {
  it("fills the teacher bar when nothing is left to review", () => {
    const html = render("TEACHER", [
      item("a", "reviewed"),
      item("b", "reviewed"),
      item("c", "reviewed"),
    ]);
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("width:100%");
  });

  it("shows two thirds when one of three works is left to review", () => {
    const html = render("TEACHER", [
      item("a", "submitted"),
      item("b", "reviewed"),
      item("c", "reviewed"),
    ]);
    expect(html).toContain('aria-valuenow="67"');
    expect(html).toContain("width:67%");
  });

  it("uses the same completed-work rule for the student card", () => {
    const html = render("STUDENT", [
      item("a", "assigned"),
      item("b", "reviewed"),
      item("c", "reviewed"),
    ]);
    expect(html).toContain('aria-valuenow="67"');
    expect(html).toContain("width:67%");
  });
});
