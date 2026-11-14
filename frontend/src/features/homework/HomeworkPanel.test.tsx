import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "STUDENT" }));
vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ user: { role: state.role } }) }));

import { queryKeys } from "../../api/queries";
import type { HomeworkPage } from "../../api/types";
import { HomeworkPanel } from "./HomeworkPanel";
import { formSchema, submissionSchema } from "./homework-schema";

function renderList(role: "STUDENT" | "TEACHER", page: HomeworkPage): string {
  state.role = role;
  const client = new QueryClient();
  client.setQueryData(queryKeys.homework(role, undefined, 0), page);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><HomeworkPanel /></QueryClientProvider>,
  );
}

describe("homework views", () => {
  it("validates required assignment fields", () => {
    expect(formSchema.safeParse({ student_id: "", title: " ", description: "", due_at: "" }).success).toBe(false);
    expect(formSchema.safeParse({
      student_id: "00000000-0000-4000-8000-000000000001",
      title: "Задачи", description: "", due_at: "2030-01-01T12:00",
    }).success).toBe(true);
  });

  it("shows the student's assigned work and safe unknown-status label", () => {
    const html = renderList("STUDENT", {
      total: 1, limit: 20, offset: 0,
      items: [{
        id: "homework-1", teacher_id: "teacher-1", teacher_name: "Иван Иванов",
        student_id: "student-1", student_name: "Анна Петрова", title: "Решить задачи",
        description: "Задачи 1–5", due_at: "2030-01-01T12:00:00Z", status: "future_status",
        is_overdue: false, created_at: "2029-12-01T12:00:00Z", attachments: [],
      }],
    });
    expect(html).toContain("Решить задачи");
    expect(html).toContain("Иван Иванов");
    expect(html).toContain("Неизвестный статус");
    expect(html).not.toContain("Просрочено");
  });

  it("shows an overdue assigned status while keeping the submit action", () => {
    const item: HomeworkPage["items"][number] = {
      id: "overdue-1", teacher_id: "teacher-1", teacher_name: "Иван Иванов",
      student_id: "student-1", student_name: "Анна Петрова", title: "Задачи",
      description: null, due_at: "2020-01-01T12:00:00Z", status: "assigned",
      is_overdue: false, created_at: "2019-12-01T12:00:00Z", attachments: [],
    };
    state.role = "STUDENT";
    const client = new QueryClient();
    client.setQueryData(queryKeys.homework("STUDENT", undefined, 0), { items: [item], total: 1, limit: 20, offset: 0 });
    client.setQueryData(queryKeys.homeworkDetail("STUDENT", item.id), item);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><HomeworkPanel /></QueryClientProvider>);
    expect(html).toContain("Просрочено");
    expect(html).toMatch(/\d{2} [а-яё]+, \d{2}:\d{2}/i);
    expect(html).toContain("Сдать работу");
  });

  it("uses the existing assignment layout and shows a file download action", () => {
    state.role = "STUDENT";
    const client = new QueryClient();
    const item: HomeworkPage["items"][number] = {
      id: "homework-2", teacher_id: "teacher-2", teacher_name: "Ирина Сергеева",
      student_id: "student-2", student_name: "Олег Миронов", title: "Прочитать текст",
      description: "Страницы 10–12", due_at: "2030-02-01T12:00:00Z", status: "assigned",
      is_overdue: false, created_at: "2030-01-01T12:00:00Z",
      attachments: [{ id: "attachment-1", original_name: "условия.pdf", mime_type: "application/pdf", size_bytes: 2048, sha256: "abc", created_at: "2030-01-01T12:00:00Z" }],
    };
    client.setQueryData(queryKeys.homework("STUDENT", undefined, 0), { items: [item], total: 1, limit: 20, offset: 0 });
    client.setQueryData(queryKeys.homeworkDetail("STUDENT", item.id), item);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><HomeworkPanel /></QueryClientProvider>);
    expect(html).toContain("assignment-table");
    expect(html).toContain("selected-assignment");
    expect(html).toContain("homework-attachment");
    expect(html).toContain("условия.pdf");
    expect(html).toContain("2 КБ");
    expect(html).toContain("Скачать");
    expect(html).toContain("Сдать работу");
  });

  it("shows the submitted attempt without another submit action", () => {
    state.role = "STUDENT";
    const client = new QueryClient();
    const item: HomeworkPage["items"][number] = {
      id: "homework-3", teacher_id: "teacher-2", teacher_name: "Ирина Сергеева",
      student_id: "student-2", student_name: "Олег Миронов", title: "Прочитать текст",
      description: null, due_at: "2030-02-01T12:00:00Z", status: "submitted",
      is_overdue: false, created_at: "2030-01-01T12:00:00Z", attachments: [],
      latest_submission: {
        id: "submission-1", homework_id: "homework-3", attempt_no: 1,
        comment: "Готово", submitted_at: "2030-02-02T12:00:00Z", is_late: true,
        attachments: [],
      },
    };
    client.setQueryData(queryKeys.homework("STUDENT", undefined, 0), { items: [item], total: 1, limit: 20, offset: 0 });
    client.setQueryData(queryKeys.homeworkDetail("STUDENT", item.id), item);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><HomeworkPanel /></QueryClientProvider>);
    expect(html).toContain("На проверке");
    expect(html).toContain("Отправленная работа · попытка №");
    expect(html).toContain("Сдано с опозданием");
    expect(html).not.toContain("Сдать работу");
  });

  it("validates the comment length and offers the teacher queue", () => {
    expect(submissionSchema.safeParse({ comment: "x".repeat(10001) }).success).toBe(false);
    expect(submissionSchema.safeParse({ comment: "Готово" }).success).toBe(true);
    const html = renderList("TEACHER", { items: [], total: 0, limit: 20, offset: 0 });
    expect(html).toContain("Ожидают проверки");
  });

  it("shows an empty teacher list and assignment action", () => {
    const html = renderList("TEACHER", { items: [], total: 0, limit: 20, offset: 0 });
    expect(html).toContain("Заданий пока нет");
    expect(html).toContain("Назначить ДЗ");
  });
});
