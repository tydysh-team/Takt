// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Temporal } from "@js-temporal/polyfill";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../shared/config/environment", () => ({ environment: { apiBaseUrl: "http://api.example" } }));

import { api, queryKeys } from "../api/queries";
import type { CurrentUser, LessonDTO, LessonReadDTO } from "../api/types";
import { AuthContext } from "../features/auth/auth-context";
import { SchedulePage } from "./SchedulePage";
import { ToastProvider } from "../components/ui/ToastProvider";
import { ApiError } from "../api/client";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(role: "TEACHER" | "STUDENT", status: LessonReadDTO["status"] = "in_progress", timezone = "UTC", grouped = true) {
  const user: CurrentUser = { id: role === "TEACHER" ? "teacher" : "a", role, email: "viewer@example.com",
    first_name: "Viewer", last_name: "Example", middle_name: null };
  const currentDate = Temporal.Now.instant().toZonedDateTimeISO(timezone).toPlainDate();
  const monday = currentDate.subtract({ days: currentDate.dayOfWeek - 1 });
  const today = new Date(`${monday.toString()}T10:00:00Z`);
  const lesson: LessonReadDTO = {
    id: "group", title: "Групповая алгебра", description: "Описание", starts_at: today.toISOString(),
    ends_at: new Date(today.getTime() + 3600_000).toISOString(), duration_minutes: 60,
    status, attendance: role === "STUDENT" ? "present" : "not_set",
    is_rescheduled: false, cancellation_reason: null, student: null, participant_count: 2,
    teacher: { id: "teacher", first_name: "Иван", last_name: "Учитель", middle_name: null },
    participants: role === "TEACHER" ? [
      { id: "a", first_name: "Анна", last_name: "Петрова", middle_name: null, attendance: "present" },
      { id: "b", first_name: "Борис", last_name: "Иванов", middle_name: null, attendance: "absent" },
    ] : [],
  };
  if (!grouped) {
    lesson.student = { id: "a", first_name: "Анна", last_name: "Петрова", middle_name: null };
    lesson.participant_count = 1;
    lesson.participants = [];
  }
  vi.spyOn(api, "searchLessons").mockResolvedValue([lesson]);
  vi.spyOn(api, "lesson").mockResolvedValue(role === "TEACHER" ? lesson : {
    ...lesson, participants: [
      { first_name: "Анна", last_name: "Петрова", is_self: true },
      { first_name: "Борис", last_name: "Иванов", is_self: false },
    ],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(queryKeys.profile, { timezone });
  client.setQueryData(queryKeys.teacherStudents, [
    { id: "a", first_name: "Анна", last_name: "Петрова", middle_name: null },
    { id: "b", first_name: "Борис", last_name: "Иванов", middle_name: null },
  ]);
  const result = render(<AuthContext.Provider value={{ status: "authenticated", user,
    login: vi.fn(), verifyMfaLogin: vi.fn(), register: vi.fn(), logout: vi.fn(),
    endSession: vi.fn(), updateCurrentUser: vi.fn(),
  }}><QueryClientProvider client={client}><MemoryRouter><ToastProvider><SchedulePage /></ToastProvider></MemoryRouter></QueryClientProvider></AuthContext.Provider>);
  return { ...result, lesson, client };
}

it.each(["TEACHER", "STUDENT"] as const)("renders one group card and role-specific details for %s", async (role) => {
  const { container } = setup(role);
  await waitFor(() => { expect(container.querySelectorAll(".schedule-event")).toHaveLength(1); });
  const card = container.querySelector(".schedule-event")!;
  expect(card.textContent).toContain(role === "TEACHER" ? "2 ученика" : "Групповое занятие");
  expect(card.textContent).not.toContain("Борис Иванов");
  if (role === "STUDENT") expect(card.textContent).toContain("Иван Учитель");
  fireEvent.click(card);
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByText(role === "TEACHER" ? "Анна Петрова" : "Анна Петрова — Вы")).toBeTruthy();
  expect(within(dialog).getByText("Борис Иванов")).toBeTruthy();
  if (role === "STUDENT") {
    expect(within(dialog).getByText("Присутствовал")).toBeTruthy();
    expect(within(dialog).queryByText("Отсутствовал")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Не отмечено" })).toBeNull();
    expect(within(dialog).queryAllByRole("link")).toHaveLength(0);
  } else {
    expect(within(dialog).getAllByRole("button", { name: "Не отмечено" })).toHaveLength(2);
  }
  fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
  fireEvent.click(screen.getByRole("button", { name: "Список" }));
  await waitFor(() => { expect(container.querySelectorAll(".lesson-card")).toHaveLength(1); });
  expect(container.querySelector(".lesson-card")?.textContent).toContain(role === "TEACHER" ? "2 ученика" : "Групповое занятие");
  expect(container.querySelector(".lesson-card")?.textContent).not.toContain("Борис Иванов");
});

it("shows every blocking participant and keeps the group draft without confirmation", async () => {
  setup("TEACHER");
  const create = vi.spyOn(api, "createLesson").mockRejectedValue(new ApiError(
    "student_schedule_conflict", "Занято", 409, [], { conflicts: [
      { student_id: "a", student_name: "Анна Петрова", starts_at: "2035-03-15T12:00:00Z", ends_at: "2035-03-15T13:00:00Z" },
      { student_id: "b", student_name: "Борис Иванов", starts_at: "2035-03-15T12:30:00Z", ends_at: "2035-03-15T13:30:00Z" },
    ] },
  ));
  fireEvent.click(screen.getByRole("button", { name: /Создать занятие/ }));
  fireEvent.click(screen.getByRole("button", { name: "Групповое" }));
  fireEvent.click(screen.getByRole("button", { name: /Участники: выбрано/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Анна Петрова" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Борис Иванов" }));
  fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Новая группа" } });
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "15.03.2035" } });
  fireEvent.change(screen.getByLabelText("Время"), { target: { value: "12:30" } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Создать занятие" }));
  await waitFor(() => { expect(create).toHaveBeenCalledWith(expect.objectContaining({ student_ids: ["a", "b"], confirm_conflict: false })); });
  expect(create.mock.calls[0]?.[0]).not.toHaveProperty("student_id");
  expect(await screen.findByText(/Занято: Анна Петрова:/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Участники: выбрано 2" })).toBeTruthy();
  expect((screen.getByLabelText("Название") as HTMLInputElement).value).toBe("Новая группа");
  expect(screen.queryByText("Создать несмотря на конфликт")).toBeNull();
  expect(within(screen.getByRole("region", { name: "Уведомления" })).queryAllByRole("status")).toHaveLength(0);
});

function draft(grouped = false, repeat = false) {
  fireEvent.click(screen.getByRole("button", { name: /Создать занятие/ }));
  if (grouped) {
    fireEvent.click(screen.getByRole("button", { name: "Групповое" }));
    fireEvent.click(screen.getByRole("button", { name: /Участники: выбрано/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Анна Петрова" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Борис Иванов" }));
  } else {
    fireEvent.change(screen.getByLabelText("Ученик"), { target: { value: "a" } });
  }
  fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Новая алгебра" } });
  fireEvent.input(screen.getByLabelText("Дата"), { target: { value: "02122035" }, inputType: "insertFromPaste" });
  fireEvent.input(screen.getByLabelText("Время"), { target: { value: "15.30" }, inputType: "insertFromPaste" });
  if (repeat) fireEvent.click(screen.getByLabelText("Повторять каждую неделю"));
  return within(screen.getByRole("dialog")).getByRole("button", { name: "Создать занятие" });
}

function createdLesson(lesson: LessonReadDTO): LessonDTO {
  return { ...lesson, teacher_id: lesson.teacher.id, student_id: lesson.student?.id ?? null,
    student_ids: lesson.student ? [lesson.student.id] : ["a", "b"], participant_count: lesson.participant_count ?? 1 };
}

async function openLesson(container: HTMLElement) {
  await waitFor(() => { expect(container.querySelector(".schedule-event")).not.toBeNull(); });
  fireEvent.click(container.querySelector(".schedule-event")!);
  return screen.findByRole("dialog");
}

it.each([false, true])("notifies only after the create request succeeds, grouped=%s", async (grouped) => {
  const { container, lesson, client } = setup("TEACHER", "planned", "Europe/Samara", grouped);
  const invalidation = vi.spyOn(client, "invalidateQueries");
  let resolve!: (lesson: LessonDTO) => void;
  const request = new Promise<LessonDTO>((done) => { resolve = done; });
  const create = vi.spyOn(api, "createLesson").mockReturnValue(request);
  fireEvent.click(draft(grouped));
  await waitFor(() => { expect(create).toHaveBeenCalledOnce(); });
  const payload = create.mock.calls[0]![0];
  expect(payload.starts_at).toBe("2035-12-02T11:30:00Z");
  expect(payload).toMatchObject(grouped ? { student_ids: ["a", "b"] } : { student_id: "a" });
  const region = screen.getByRole("region", { name: "Уведомления" });
  expect(within(region).queryAllByRole("status")).toHaveLength(0);
  await act(async () => { resolve(createdLesson(lesson)); });
  expect(await within(region).findByText("Занятие успешно создано")).toBeTruthy();
  expect(container.textContent).not.toContain("Занятие успешно создано");
  await waitFor(() => {
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["progress", "TEACHER", "a"] });
    if (grouped) expect(invalidation).toHaveBeenCalledWith({ queryKey: ["progress", "TEACHER", "b"] });
  });
});

it("uses a separate success toast for a weekly series", async () => {
  const { lesson } = setup("TEACHER");
  const response = createdLesson(lesson);
  const create = vi.spyOn(api, "createLessonSeries").mockResolvedValue([response, { ...response, id: "second" }]);
  fireEvent.click(draft(true, true));
  await waitFor(() => { expect(create).toHaveBeenCalledWith(expect.objectContaining({ student_ids: ["a", "b"], recurrence: "weekly", count: 2 })); });
  const region = screen.getByRole("region", { name: "Уведомления" });
  expect(await within(region).findByText("Серия занятий успешно создана")).toBeTruthy();
  expect(within(region).queryByText("Занятие успешно создано")).toBeNull();
});

it("keeps validation errors beside fields and does not notify or send invalid input", () => {
  setup("TEACHER");
  const create = vi.spyOn(api, "createLesson");
  const submit = draft();
  fireEvent.input(screen.getByLabelText("Дата"), { target: { value: "32132035" }, inputType: "insertFromPaste" });
  fireEvent.input(screen.getByLabelText("Время"), { target: { value: "2570" }, inputType: "insertFromPaste" });
  fireEvent.click(submit);
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByText("Укажите корректную дату.")).toBeTruthy();
  expect(screen.getByText("Укажите корректное время.")).toBeTruthy();
  expect(screen.getByLabelText("Дата").getAttribute("aria-invalid")).toBe("true");
  expect(within(screen.getByRole("region", { name: "Уведомления" })).queryAllByRole("status")).toHaveLength(0);
});

it("retains teacher conflict confirmation and the formatted draft until a confirmed success", async () => {
  const { lesson } = setup("TEACHER");
  const create = vi.spyOn(api, "createLesson")
    .mockRejectedValueOnce(new ApiError("lesson_time_conflict", "Пересечение", 409, [], { conflicts: [
      { id: "busy", title: "Другое занятие", starts_at: lesson.starts_at, duration_minutes: 60 },
    ] }))
    .mockResolvedValue(createdLesson(lesson));
  fireEvent.click(draft(true));
  expect(await screen.findByText("Найдено пересечение")).toBeTruthy();
  const region = screen.getByRole("region", { name: "Уведомления" });
  expect(within(region).queryAllByRole("status")).toHaveLength(0);
  expect(screen.getByLabelText<HTMLInputElement>("Дата").value).toBe("02.12.2035");
  expect(screen.getByLabelText<HTMLInputElement>("Время").value).toBe("15:30");
  fireEvent.click(screen.getByRole("button", { name: "Создать несмотря на конфликт" }));
  expect(await within(region).findByText("Занятие успешно создано")).toBeTruthy();
  expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ student_ids: ["a", "b"], confirm_conflict: true }));
});

it.each([false, true])("reuses formatted fields for reschedule and preserves API timezones, grouped=%s", async (grouped) => {
  const { container, lesson } = setup("TEACHER", "planned", "Europe/Samara", grouped);
  const reschedule = vi.spyOn(api, "rescheduleLesson").mockResolvedValue({ ...lesson, starts_at: "2035-12-02T11:30:00Z" });
  await openLesson(container);
  fireEvent.click(await screen.findByRole("button", { name: "Перенести…" }));
  expect(screen.getByLabelText<HTMLInputElement>("Новая дата").value).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  expect(screen.getByLabelText<HTMLInputElement>("Новое время").value).toBe("14:00");
  fireEvent.input(screen.getByLabelText("Новая дата"), { target: { value: "02122035" }, inputType: "insertFromPaste" });
  fireEvent.input(screen.getByLabelText("Новое время"), { target: { value: "15.30" }, inputType: "insertFromPaste" });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить перенос" }));
  await waitFor(() => { expect(reschedule).toHaveBeenCalledWith("group", "2035-12-02T11:30:00Z", false); });
  expect(await within(screen.getByRole("region", { name: "Уведомления" })).findByText("Занятие перенесено")).toBeTruthy();
});

it("retains a blocking student conflict inside the reschedule dialog", async () => {
  const { container } = setup("TEACHER", "planned");
  vi.spyOn(api, "rescheduleLesson").mockRejectedValue(new ApiError("student_schedule_conflict", "Занято", 409, [], { conflicts: [
    { student_id: "b", student_name: "Борис Иванов", starts_at: "2035-12-02T15:00:00Z", ends_at: "2035-12-02T16:00:00Z" },
  ] }));
  await openLesson(container);
  fireEvent.click(await screen.findByRole("button", { name: "Перенести…" }));
  fireEvent.input(screen.getByLabelText("Новая дата"), { target: { value: "02122035" }, inputType: "insertFromPaste" });
  fireEvent.input(screen.getByLabelText("Новое время"), { target: { value: "15:30" }, inputType: "insertFromPaste" });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить перенос" }));
  expect(await screen.findByText(/Занято: Борис Иванов:/)).toBeTruthy();
  expect(screen.getByLabelText<HTMLInputElement>("Новая дата").value).toBe("02.12.2035");
  expect(screen.queryByRole("button", { name: "Перенести несмотря на конфликт" })).toBeNull();
  expect(within(screen.getByRole("region", { name: "Уведомления" })).queryAllByRole("status")).toHaveLength(0);
});

it("notifies after cancellation without an inline success message", async () => {
  const { container, lesson } = setup("TEACHER");
  vi.spyOn(api, "cancelLesson").mockResolvedValue({ ...lesson, status: "cancelled" });
  await openLesson(container);
  fireEvent.click(await screen.findByRole("button", { name: "Отменить занятие", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Да, отменить занятие" }));
  expect(await within(screen.getByRole("region", { name: "Уведомления" })).findByText("Занятие отменено")).toBeTruthy();
  expect(container.textContent).not.toContain("Занятие отменено");
});

it("deduplicates successful attendance toasts for consecutive group participants", async () => {
  const { container, lesson } = setup("TEACHER");
  const attendance = vi.spyOn(api, "updateLessonAttendance").mockResolvedValue(lesson);
  const dialog = await openLesson(container);
  const buttons = await within(dialog).findAllByRole("button", { name: "Не отмечено" });
  fireEvent.click(buttons[0]!);
  const region = screen.getByRole("region", { name: "Уведомления" });
  expect(await within(region).findByText("Посещаемость обновлена")).toBeTruthy();
  await waitFor(() => { expect((buttons[1] as HTMLButtonElement).disabled).toBe(false); });
  fireEvent.click(buttons[1]!);
  await waitFor(() => { expect(attendance).toHaveBeenCalledTimes(2); });
  expect(attendance).toHaveBeenNthCalledWith(1, "group", "not_set", "a");
  expect(attendance).toHaveBeenNthCalledWith(2, "group", "not_set", "b");
  expect(within(region).getAllByText("Посещаемость обновлена")).toHaveLength(1);
});
