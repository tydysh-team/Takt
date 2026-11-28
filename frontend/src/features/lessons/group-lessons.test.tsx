// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { LessonCreateForm } from "./LessonCreateForm";
import { LessonParticipants, groupLabel, participantIds } from "./LessonParticipants";
import { invalidateLessonRelated } from "../../api/invalidation";
import type { LessonReadDTO } from "../../api/types";
import { scheduleCalendarItems } from "./schedule-items";

afterEach(cleanup);

const students = [
  { id: "a", first_name: "Анна", last_name: "Петрова", middle_name: null },
  { id: "b", first_name: "Борис", last_name: "Иванов", middle_name: null },
  { id: "c", first_name: "Вера", last_name: "Смирнова", middle_name: null },
];

function form() {
  const onCreate = vi.fn();
  const props = { students, timezone: "UTC", pending: false, onCancel: vi.fn(), onCreate };
  const view = render(<LessonCreateForm {...props} />);
  fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Алгебра" } });
  fireEvent.change(screen.getByLabelText("Описание"), { target: { value: "Уравнения" } });
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "15.03.2035" } });
  fireEvent.change(screen.getByLabelText("Время"), { target: { value: "12:30" } });
  return { onCreate, props, ...view };
}

function selectGroup() {
  fireEvent.click(screen.getByRole("button", { name: "Групповое" }));
  fireEvent.click(screen.getByRole("button", { name: /Участники: выбрано/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Анна Петрова" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Борис Иванов" }));
}

describe("group lesson form", () => {
  it("defaults to individual and preserves all other fields and recurrence on switching", () => {
    const { onCreate } = form();
    expect(screen.getByRole("button", { name: "Индивидуальное" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("Ученик"), { target: { value: "a" } });
    fireEvent.click(screen.getByLabelText("Повторять каждую неделю"));
    selectGroup();
    fireEvent.click(screen.getByRole("button", { name: "Индивидуальное" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать занятие" }));
    expect(onCreate).toHaveBeenCalledWith({ student_id: "a", title: "Алгебра", description: "Уравнения",
      starts_at: "2035-03-15T12:30:00Z", duration_minutes: 60, recurrence: { frequency: "weekly", count: 2 } });
  });

  it("searches, selects without closing, keeps selections on closing, removes chips and validates", () => {
    const { onCreate } = form();
    selectGroup();
    const search = screen.getByRole("textbox", { name: "Поиск учеников" });
    fireEvent.change(search, { target: { value: "ивАН" } });
    expect(screen.getByRole("checkbox", { name: "Борис Иванов" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Анна Петрова" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть список" }));
    expect(screen.getByRole("button", { name: "Участники: выбрано 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Исключить Анна Петрова" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать занятие" }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText("Выберите минимум двух разных учеников.")).toBeTruthy();
  });

  it("sends only student_ids and preserves draft and participants after a server conflict", () => {
    const { onCreate, rerender, props } = form();
    selectGroup();
    fireEvent.click(screen.getByRole("button", { name: "Создать занятие" }));
    expect(onCreate).toHaveBeenCalledWith({ student_ids: ["a", "b"], title: "Алгебра", description: "Уравнения",
      starts_at: "2035-03-15T12:30:00Z", duration_minutes: 60 });
    rerender(<LessonCreateForm {...props} serverTimeError="Борис Иванов: занят в 12:30" />);
    expect((screen.getByLabelText("Название") as HTMLInputElement).value).toBe("Алгебра");
    expect(screen.getByRole("button", { name: "Участники: выбрано 2" })).toBeTruthy();
    expect(screen.getByText("Борис Иванов: занят в 12:30")).toBeTruthy();
  });
});

const lesson: LessonReadDTO = {
  id: "group", title: "Алгебра", description: null, starts_at: "2035-03-15T12:30:00Z",
  ends_at: "2035-03-15T13:30:00Z", duration_minutes: 60, status: "completed",
  is_rescheduled: false, attendance: "not_set", cancellation_reason: null,
  teacher: { id: "t", first_name: "Иван", last_name: "Иванов", middle_name: null },
  student: null, participant_count: 2,
  participants: [{ ...students[0]!, attendance: "present" }, { ...students[1]!, attendance: "absent" }],
};

describe("group participants", () => {
  it("renders one calendar item with participant count and no arbitrary student", () => {
    const items = scheduleCalendarItems([lesson]);
    expect(items).toHaveLength(1);
    expect(groupLabel(lesson)).toContain("2 ученика");
    expect(participantIds(lesson)).toEqual(["a", "b"]);
    expect(lesson.student).toBeNull();
  });

  it("lets the teacher change each attendance independently including reset", () => {
    const onAttendance = vi.fn();
    render(<LessonParticipants lesson={lesson} isTeacher canUpdate pending={false} onAttendance={onAttendance} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Анна Петрова")).toBeTruthy();
    expect(within(rows[1]!).getByText("Борис Иванов")).toBeTruthy();
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Не отмечено" }));
    expect(onAttendance).toHaveBeenCalledWith("not_set", "b");
  });

  it("shows student names and self marker without peer attendance or profile links", () => {
    const studentLesson = { ...lesson, attendance: "present" as const, participants: [
      { first_name: "Анна", last_name: "Петрова", is_self: true },
      { first_name: "Борис", last_name: "Иванов", is_self: false },
    ] };
    const { container } = render(<LessonParticipants lesson={studentLesson} isTeacher={false} canUpdate={false} pending={false} onAttendance={vi.fn()} />);
    expect(screen.getByText("Анна Петрова — Вы")).toBeTruthy();
    expect(screen.getByText("Борис Иванов")).toBeTruthy();
    expect(screen.queryByText("Отсутствовал")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector("a")).toBeNull();
  });

  it("invalidates every affected student and preserves cached periods and values", async () => {
    const client = new QueryClient();
    const keys = [
      ["lessons", "detail", "group"], ["lessons", "person-schedule", "a"],
      ["progress", "TEACHER", "a", "from", "to"], ["progress", "TEACHER", "b", "from", "to"],
      ["progress", "lesson-history", "a", "from", "to"], ["progress", "lesson-history", "b", "from", "to"],
    ];
    keys.forEach((key) => { client.setQueryData(key, { preserved: true }); });
    await invalidateLessonRelated(client, "TEACHER", ["a", "b", "a"]);
    keys.forEach((key) => {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(client.getQueryData(key)).toEqual({ preserved: true });
    });
  });
});
