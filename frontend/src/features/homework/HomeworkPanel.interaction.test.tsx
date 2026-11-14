// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ role: "STUDENT" }));
vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ user: { role: auth.role } }) }));

import { ApiError } from "../../api/client";
import { api, queryKeys } from "../../api/queries";
import type { Homework, PendingSubmission } from "../../api/types";
import { HomeworkPanel } from "./HomeworkPanel";

const assigned: Homework = {
  id: "homework-1", teacher_id: "teacher-1", teacher_name: "Иван Иванов",
  student_id: "student-1", student_name: "Анна Петрова", title: "Решить задачи",
  description: "Задачи 1–5", due_at: "2030-01-01T12:00:00Z", status: "assigned",
  is_overdue: false, created_at: "2029-12-01T12:00:00Z", attachments: [],
};

function setup(role: "STUDENT" | "TEACHER" = "STUDENT", item: Homework = assigned) {
  auth.role = role;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(queryKeys.homework(role, undefined, 0), {
    items: [item], total: 1, limit: 20, offset: 0,
  });
  client.setQueryData(queryKeys.homeworkDetail(role, item.id), item);
  client.setQueryData(queryKeys.profile, { timezone: "Europe/Samara" });
  vi.spyOn(api, "profile").mockResolvedValue({
    first_name: "Анна", last_name: "Петрова", middle_name: null,
    email: "anna@example.com", role, bio: null, timezone: "Europe/Samara",
  });
  render(<QueryClientProvider client={client}><HomeworkPanel /></QueryClientProvider>);
  return client;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("homework submission interactions", () => {
  it("validates the form, uploads a file and shows the confirmed attempt", async () => {
    const submitted: Homework = {
      ...assigned, status: "submitted",
      latest_submission: {
        id: "submission-1", homework_id: assigned.id, attempt_no: 1,
        comment: "Готово", submitted_at: "2030-01-01T13:00:00Z", is_late: true,
        attachments: [],
      },
    };
    let complete: ((value: { homework: Homework; submission: NonNullable<Homework["latest_submission"]> }) => void) | undefined;
    const submit = vi.spyOn(api, "submitHomework").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    vi.spyOn(api, "studentHomework").mockResolvedValue({ items: [submitted], total: 1, limit: 20, offset: 0 });
    vi.spyOn(api, "homeworkDetail").mockResolvedValue(submitted);
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Сдать работу" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Добавьте комментарий или файл.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Комментарий"), { target: { value: "Готово" } });
    fireEvent.change(screen.getByLabelText("Файлы решения"), {
      target: { files: [new File(["Answer"], "answer.txt", { type: "text/plain" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => { expect(submit).toHaveBeenCalledOnce(); });
    const call = submit.mock.calls[0];
    if (!call) throw new Error("Submission was not sent");
    const [homeworkId, form, key] = call;
    expect(homeworkId).toBe(assigned.id);
    expect(form.get("comment")).toBe("Готово");
    expect(form.getAll("files")).toHaveLength(1);
    expect(key).toMatch(/[0-9a-f-]{36}/);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Подождите…" }).hasAttribute("disabled")).toBe(true);
    });
    const submission = submitted.latest_submission;
    if (!submission) throw new Error("Missing test submission");
    complete?.({ homework: submitted, submission });
    await waitFor(() => { expect(screen.queryByRole("dialog")).toBeNull(); });
    expect(screen.getByText(/Отправленная работа/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Сдать работу" })).toBeNull();
  });

  it("keeps the form open and shows an API error", async () => {
    vi.spyOn(api, "submitHomework").mockRejectedValue(new ApiError("submission_conflict", "Задание сейчас нельзя сдать.", 409));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Сдать работу" }));
    fireEvent.change(screen.getByLabelText("Комментарий"), { target: { value: "Готово" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Задание сейчас нельзя сдать.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("opens the teacher queue and downloads a submitted file", async () => {
    const attachment = {
      id: "attachment-1", original_name: "answer.txt", mime_type: "text/plain",
      size_bytes: 6, sha256: "abc", created_at: "2030-01-01T13:00:00Z",
    };
    const pending: PendingSubmission = {
      id: "submission-1", homework_id: assigned.id, attempt_no: 1,
      comment: "Готово", submitted_at: "2030-01-01T13:00:00Z", is_late: true,
      attachments: [attachment], student_id: assigned.student_id,
      student_name: assigned.student_name, title: assigned.title,
      due_at: assigned.due_at, homework_status: "submitted",
    };
    const client = setup("TEACHER");
    client.setQueryData(queryKeys.pendingSubmissions(0), { items: [pending], total: 1, limit: 20, offset: 0 });
    client.setQueryData(queryKeys.pendingSubmission(pending.id), pending);
    const download = vi.spyOn(api, "downloadSubmissionAttachment").mockResolvedValue(new Blob(["Answer"]));
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Ожидают проверки" }));
    expect(screen.getByRole("button", { name: /Просмотреть работу Решить задачи/ })).toBeTruthy();
    expect(screen.getByText("Комментарий ученика")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Скачать answer.txt" }));
    await waitFor(() => { expect(download).toHaveBeenCalledWith(pending.id, attachment.id); });
  });

  it("accepts a pending attempt with a validated grade", async () => {
    const pending: PendingSubmission = {
      id: "submission-2", homework_id: assigned.id, attempt_no: 1,
      comment: "Ответ", submitted_at: "2030-01-01T13:00:00Z", is_late: true,
      attachments: [], student_id: assigned.student_id, student_name: assigned.student_name,
      title: assigned.title, due_at: assigned.due_at, homework_status: "submitted",
    };
    const client = setup("TEACHER");
    client.setQueryData(queryKeys.pendingSubmissions(0), { items: [pending], total: 1, limit: 20, offset: 0 });
    client.setQueryData(queryKeys.pendingSubmission(pending.id), pending);
    client.setQueryData(queryKeys.homeworkHistory("TEACHER", assigned.id), [pending]);
    vi.spyOn(api, "pendingSubmissions").mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    const accept = vi.spyOn(api, "acceptSubmission").mockResolvedValue({
      ...pending, review: { id: "review-1", decision: "accepted", grade: 85,
        comment: "Верно", reviewed_at: "2030-01-02T12:00:00Z" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ожидают проверки" }));
    fireEvent.click(screen.getByRole("button", { name: "Принять работу" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Оценка от 0 до 100"), { target: { value: "101" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Принять работу" }));
    expect(await within(dialog).findByText("Оценка от 0 до 100.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Оценка от 0 до 100"), { target: { value: "85" } });
    fireEvent.change(within(dialog).getByLabelText("Комментарий"), { target: { value: "Верно" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Принять работу" }));
    await waitFor(() => { expect(accept).toHaveBeenCalledWith(pending.id, { grade: 85, comment: "Верно" }); });
    await waitFor(() => { expect(screen.queryByRole("dialog")).toBeNull(); });
  });

  it("requires a teacher comment before returning a pending attempt", async () => {
    const pending: PendingSubmission = {
      id: "submission-4", homework_id: assigned.id, attempt_no: 1,
      comment: "Ответ", submitted_at: "2030-01-01T13:00:00Z", is_late: false,
      attachments: [], student_id: assigned.student_id, student_name: assigned.student_name,
      title: assigned.title, due_at: assigned.due_at, homework_status: "submitted",
    };
    const client = setup("TEACHER");
    client.setQueryData(queryKeys.pendingSubmissions(0), { items: [pending], total: 1, limit: 20, offset: 0 });
    client.setQueryData(queryKeys.pendingSubmission(pending.id), pending);
    client.setQueryData(queryKeys.homeworkHistory("TEACHER", assigned.id), [pending]);
    vi.spyOn(api, "pendingSubmissions").mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    const revision = vi.spyOn(api, "returnSubmission").mockResolvedValue({
      ...pending, review: { id: "review-3", decision: "needs_revision", grade: null,
        comment: "Исправьте пункт 2", reviewed_at: "2030-01-02T12:00:00Z" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ожидают проверки" }));
    fireEvent.click(screen.getByRole("button", { name: "Вернуть на доработку" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Вернуть на доработку" }));
    expect(await within(dialog).findByText("Укажите, что нужно исправить.")).toBeTruthy();
    expect(revision).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Что нужно исправить"), { target: { value: "Исправьте пункт 2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Вернуть на доработку" }));
    await waitFor(() => { expect(revision).toHaveBeenCalledWith(pending.id, { comment: "Исправьте пункт 2" }); });
  });

  it("requires a revision comment and shows review feedback to the student", async () => {
    const attachment = {
      id: "old-file", original_name: "answer.txt", mime_type: "text/plain",
      size_bytes: 6, sha256: "abc", created_at: "2020-01-02T12:00:00Z",
    };
    const revised: Homework = {
      ...assigned, status: "needs_revision", due_at: "2020-01-01T12:00:00Z",
      latest_submission: { id: "submission-3", homework_id: assigned.id, attempt_no: 1,
        comment: "Первый ответ", submitted_at: "2020-01-02T12:00:00Z", is_late: true,
        attachments: [attachment], review: { id: "review-2", decision: "needs_revision", grade: null,
          comment: "Исправьте пункт 2", reviewed_at: "2020-01-03T12:00:00Z" } },
    };
    const client = setup("STUDENT", revised);
    client.setQueryData(queryKeys.homeworkHistory("STUDENT", revised.id), [revised.latest_submission]);
    const download = vi.spyOn(api, "downloadStudentSubmissionAttachment").mockResolvedValue(new Blob(["Answer"]));
    URL.createObjectURL = vi.fn(() => "blob:history");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    expect((await screen.findAllByText("Исправьте пункт 2")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Отправить исправления" })).toBeTruthy();
    expect(screen.getAllByText("На доработке").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d{2} [а-яё]+, \d{2}:\d{2}/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Сдано с опозданием/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText(/Попытка №1/));
    fireEvent.click(screen.getByRole("button", { name: "Скачать answer.txt" }));
    await waitFor(() => { expect(download).toHaveBeenCalledWith(revised.id, "submission-3", attachment.id); });
  });

  it("updates an assigned overdue badge when the absolute deadline passes", async () => {
    const soon: Homework = { ...assigned, due_at: new Date(Date.now() + 150).toISOString() };
    vi.spyOn(api, "studentHomework").mockResolvedValue({ items: [soon], total: 1, limit: 20, offset: 0 });
    vi.spyOn(api, "homeworkDetail").mockResolvedValue(soon);
    setup("STUDENT", soon);
    expect(screen.getAllByText("Назначено").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Просрочено")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d{2} [а-яё]+, \d{2}:\d{2}/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Сдать работу" })).toBeTruthy();
  });

  it("shows the accepted grade without offering another submission", async () => {
    const reviewed: Homework = {
      ...assigned, status: "reviewed", latest_submission: {
        id: "submission-5", homework_id: assigned.id, attempt_no: 1,
        comment: "Ответ", submitted_at: "2030-01-01T13:00:00Z", is_late: true,
        attachments: [], review: { id: "review-5", decision: "accepted", grade: 100,
          comment: "Отлично", reviewed_at: "2030-01-02T12:00:00Z" },
      },
    };
    setup("STUDENT", reviewed);
    expect((await screen.findAllByText(/Оценка: 100/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Сдано с опозданием/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Сдать работу" })).toBeNull();
  });
});
