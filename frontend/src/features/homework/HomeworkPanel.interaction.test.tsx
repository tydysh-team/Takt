// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function setup(role: "STUDENT" | "TEACHER" = "STUDENT") {
  auth.role = role;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(queryKeys.homework(role, undefined, 0), {
    items: [assigned], total: 1, limit: 20, offset: 0,
  });
  client.setQueryData(queryKeys.homeworkDetail(role, assigned.id), assigned);
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
});
