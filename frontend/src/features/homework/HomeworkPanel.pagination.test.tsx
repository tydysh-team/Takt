// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ role: "STUDENT" }));
vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ user: { role: auth.role } }) }));

import { api, queryKeys } from "../../api/queries";
import type { Homework, HomeworkPage, PendingSubmission } from "../../api/types";
import { HomeworkPanel } from "./HomeworkPanel";

function homework(index: number): Homework {
  return {
    id: `homework-${index.toString()}`,
    teacher_id: "teacher-1",
    teacher_name: "Иван Иванов",
    student_id: "student-1",
    student_name: "Анна Петрова",
    title: `Задание ${index.toString()}`,
    description: null,
    due_at: "2030-01-01T12:00:00Z",
    status: "assigned",
    is_overdue: false,
    created_at: "2029-12-01T12:00:00Z",
    attachments: [],
  };
}

function pending(index: number): PendingSubmission {
  return {
    id: `submission-${index.toString()}`, homework_id: `homework-${index.toString()}`, attempt_no: 1,
    comment: null, submitted_at: "2030-01-01T13:00:00Z", is_late: false, attachments: [],
    student_id: "student-1", student_name: "Анна Петрова", title: `Работа ${index.toString()}`,
    due_at: "2030-01-01T12:00:00Z", homework_status: "submitted",
  };
}

function page(items: Homework[], total: number, limit: number, offset: number): HomeworkPage {
  return { items, total, limit, offset };
}

const pages: Record<string, HomeworkPage> = {
  "0/5": page([1, 2, 3, 4, 5].map(homework), 12, 5, 0),
  "5/5": page([6, 7, 8, 9, 10].map(homework), 12, 5, 5),
  "10/5": page([11, 12].map(homework), 12, 5, 10),
  "0/10": page(Array.from({ length: 10 }, (_, index) => homework(index + 1)), 12, 10, 0),
  "10/10": page([11, 12].map(homework), 12, 10, 10),
  "0/20": page(Array.from({ length: 12 }, (_, index) => homework(index + 1)), 12, 20, 0),
};

function setup(role: "STUDENT" | "TEACHER" = "STUDENT") {
  auth.role = role;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  Object.entries(pages).forEach(([key, value]) => {
    const [offset, limit] = key.split("/").map(Number) as [number, number];
    client.setQueryData(queryKeys.homework(role, undefined, offset, { limit }), value);
  });
  client.setQueryData(queryKeys.homeworkDetail(role, "homework-1"), homework(1));
  client.setQueryData(queryKeys.profile, { timezone: "Europe/Samara" });
  vi.spyOn(api, "profile").mockResolvedValue({
    first_name: "Анна", last_name: "Петрова", middle_name: null,
    email: "anna@example.com", role, bio: null, timezone: "Europe/Samara",
  });
  const studentHomework = vi.spyOn(api, "studentHomework").mockRejectedValue(new Error("unexpected request"));
  const teacherHomework = vi.spyOn(api, "teacherHomework").mockRejectedValue(new Error("unexpected request"));
  const pendingSubmissions = vi.spyOn(api, "pendingSubmissions").mockResolvedValue({ items: [], total: 0, limit: 5, offset: 0 });
  render(<QueryClientProvider client={client}><HomeworkPanel /></QueryClientProvider>);
  return { client, studentHomework, teacherHomework, pendingSubmissions };
}

const button = (name: string) => screen.getByRole("button", { name });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("homework list pagination", () => {
  it("shows five records by default with page and total counts", () => {
    setup();
    expect(screen.getByText("Страница 1 из 3")).toBeTruthy();
    expect(screen.getByText("Всего 12 заданий")).toBeTruthy();
    expect(screen.getByText("1–5 из 12")).toBeTruthy();
    expect(screen.getByRole("button", { name: "5" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "10" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Задание 5/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Задание 6/ })).toBeNull();
  });

  it("disables the previous button on the first page and the next button on the last page", () => {
    setup();
    expect(button("Предыдущая").hasAttribute("disabled")).toBe(true);
    expect(button("Следующая").hasAttribute("disabled")).toBe(false);

    fireEvent.click(button("Следующая"));
    expect(screen.getByText("Страница 2 из 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Задание 6/ })).toBeTruthy();
    expect(button("Предыдущая").hasAttribute("disabled")).toBe(false);

    fireEvent.click(button("Следующая"));
    expect(screen.getByText("Страница 3 из 3")).toBeTruthy();
    expect(screen.getByText("11–12 из 12")).toBeTruthy();
    expect(button("Следующая").hasAttribute("disabled")).toBe(true);
    expect(button("Последняя").hasAttribute("disabled")).toBe(true);

    fireEvent.click(button("Предыдущая"));
    expect(screen.getByText("Страница 2 из 3")).toBeTruthy();
  });

  it("jumps to the last page and back to the first one", () => {
    setup();
    fireEvent.click(button("Последняя"));
    expect(screen.getByText("Страница 3 из 3")).toBeTruthy();
    fireEvent.click(button("Предыдущая"));
    fireEvent.click(button("Предыдущая"));
    expect(screen.getByText("Страница 1 из 3")).toBeTruthy();
    expect(button("Предыдущая").hasAttribute("disabled")).toBe(true);
  });

  it("changing the page size resets the offset to the first page", () => {
    setup();
    fireEvent.click(button("Следующая"));
    fireEvent.click(button("Следующая"));
    expect(screen.getByText("Страница 3 из 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "10" }));
    expect(screen.getByText("Страница 1 из 2")).toBeTruthy();
    expect(screen.getByText("1–10 из 12")).toBeTruthy();
    expect(screen.getByRole("button", { name: "10" }).getAttribute("aria-pressed")).toBe("true");
    expect(button("Предыдущая").hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "20" }));
    expect(screen.getByText("Страница 1 из 1")).toBeTruthy();
    expect(screen.queryByText(/^1–12 из 12$/)).toBeNull();
    expect(button("Следующая").hasAttribute("disabled")).toBe(true);
  });

  it("keeps working on the teacher list and resets the page on a filter change", () => {
    const { teacherHomework } = setup("TEACHER");
    fireEvent.click(button("Следующая"));
    expect(screen.getByText("Страница 2 из 3")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Фильтр статуса всех доступных заданий"), { target: { value: "reviewed" } });
    expect(screen.getByText("Страница 1 из 3")).toBeTruthy();
    expect(button("Предыдущая").hasAttribute("disabled")).toBe(true);
    // The filtered page is not cached in this test, so the query goes to the API with offset 0.
    expect(teacherHomework).toHaveBeenCalled();
    expect(teacherHomework.mock.calls[0]?.[1]).toBe(0);
  });

  it("resets the page when the search text changes", () => {
    setup();
    fireEvent.click(button("Следующая"));
    expect(screen.getByText("Страница 2 из 3")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Поиск по всем доступным заданиям"), { target: { value: "задачи" } });
    expect(screen.getByText("Страница 1 из 3")).toBeTruthy();
  });
});

describe("pending queue pagination", () => {
  it("paginates the review queue five records at a time", async () => {
    const { client } = setup("TEACHER");
    const queueKey = queryKeys.pendingSubmissions(0, undefined, 5);
    client.setQueryData(queueKey, { items: [1, 2, 3, 4, 5].map(pending), total: 7, limit: 5, offset: 0 });
    client.setQueryData(queryKeys.pendingSubmission("submission-1"), pending(1));
    fireEvent.click(button("Ожидают проверки"));
    expect(screen.getByText("Страница 1 из 2")).toBeTruthy();
    expect(screen.getByText("Всего 7 заданий")).toBeTruthy();
    expect(button("Следующая").hasAttribute("disabled")).toBe(false);

    client.setQueryData(queryKeys.pendingSubmissions(5, undefined, 5), { items: [6, 7].map(pending), total: 7, limit: 5, offset: 5 });
    fireEvent.click(button("Следующая"));
    expect(await screen.findByRole("button", { name: /Просмотреть работу Работа 6/ })).toBeTruthy();
    expect(screen.getByText("Страница 2 из 2")).toBeTruthy();
    expect(button("Следующая").hasAttribute("disabled")).toBe(true);
  });

  it("switches the queue page size and returns to the first page", async () => {
    const { client } = setup("TEACHER");
    client.setQueryData(queryKeys.pendingSubmissions(0, undefined, 5), { items: [1, 2, 3, 4, 5].map(pending), total: 12, limit: 5, offset: 0 });
    client.setQueryData(queryKeys.pendingSubmission("submission-1"), pending(1));
    fireEvent.click(button("Ожидают проверки"));
    client.setQueryData(queryKeys.pendingSubmissions(5, undefined, 5), { items: [6, 7, 8, 9, 10].map(pending), total: 12, limit: 5, offset: 5 });
    fireEvent.click(button("Следующая"));
    expect(screen.getByText("Страница 2 из 3")).toBeTruthy();

    const ten = Array.from({ length: 10 }, (_, index) => pending(index + 1));
    client.setQueryData(queryKeys.pendingSubmissions(0, undefined, 10), { items: ten, total: 12, limit: 10, offset: 0 });
    fireEvent.click(screen.getByRole("button", { name: "10" }));
    await waitFor(() => {
      expect(screen.getByText("Страница 1 из 2")).toBeTruthy();
      expect(screen.getByText("1–10 из 12")).toBeTruthy();
      expect(button("Предыдущая").hasAttribute("disabled")).toBe(true);
    });
  });
});
