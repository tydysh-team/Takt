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

function render(role: "TEACHER" | "STUDENT", items: Homework[], assigned = 0, revision = 0, pending = 0): string {
  state.role = role;
  const client = new QueryClient();
  const page: HomeworkPage = { items, total: items.length, limit: 20, offset: 0 };
  client.setQueryData(queryKeys.homework(role, undefined, 0), page);
  client.setQueryData(queryKeys.pendingSubmissions(0), { items: [], total: pending, limit: 20, offset: 0 });
  client.setQueryData(queryKeys.homework("STUDENT", undefined, 0, { status: "assigned" }), {
    items: [], total: assigned, limit: 20, offset: 0,
  });
  client.setQueryData(queryKeys.homework("STUDENT", undefined, 0, { status: "needs_revision" }), {
    items: [], total: revision, limit: 20, offset: 0,
  });
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

describe("homework action counters", () => {
  it("shows the server's complete teacher queue total, independent of list items", () => {
    const html = render("TEACHER", [item("a", "assigned")], 0, 0, 3);
    expect(html).toContain("Ожидают проверки");
    expect(html).toContain("<strong>3</strong>");
    expect(html).not.toContain('role="progressbar"');
  });

  it("shows zero instead of a completion percentage", () => {
    const html = render("TEACHER", [item("a", "reviewed")]);
    expect(html).toContain("<strong>0</strong>");
    expect(html).not.toContain("100%");
  });

  it("adds assigned and revision totals across all student homework", () => {
    const html = render("STUDENT", [item("a", "reviewed")], 4, 2);
    expect(html).toContain("Требуют действия");
    expect(html).toContain("<strong>6</strong>");
    expect(html).toContain("Новые: 4");
    expect(html).toContain("На доработке: 2");
  });
});
