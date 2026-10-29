import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LessonCreateForm } from "./LessonCreateForm";
import { lessonFormErrors, minuteSuggestions, parseLessonDate } from "./lesson-form-validation";

describe("lesson creation form", () => {
  it("uses connected students, title, optional description and standard duration select", () => {
    const html = renderToStaticMarkup(<LessonCreateForm
      students={[{ id: "student-id", first_name: "Иван", last_name: "Смирнов", middle_name: null }]}
      timezone="Europe/Moscow"
      pending={false}
      onCancel={vi.fn()}
      onCreate={vi.fn()}
    />);

    expect(html).toContain('name="student_id"');
    expect(html).toContain("Иван Смирнов");
    expect(html).toContain('name="title"');
    expect(html).toContain('name="description"');
    expect(html).toContain('name="date"');
    expect(html).toContain('name="start"');
    expect(html).not.toContain('name="start_hour"');
    expect(html).not.toContain('name="start_minute"');
    expect(html).not.toContain('name="subject"');
    expect(html).toContain('id="lesson-duration" name="duration_minutes"');
    expect(html).not.toContain('type="time"');
    expect(html).not.toContain('step="300"');
    expect(html).toContain('placeholder="дд.мм.гггг"');
    expect(html).toContain('placeholder="ЧЧ:ММ"');
    expect(html).toMatch(/id="lesson-date"[^>]*type="text"[^>]*name="date"/);
    expect(html).toMatch(/id="lesson-start"[^>]*type="text"[^>]*name="start"/);
    expect(html).toMatch(/id="lesson-date"[^>]*value=""/);
    expect(html).toMatch(/id="lesson-start"[^>]*value=""/);
    expect(html).not.toContain('id="lesson-time-panel"');
    expect(html).toContain("Необязательно");
    expect(html).toContain("Запланируйте новую учебную встречу.");
    for (const duration of [30, 45, 60, 90, 120]) {
      expect(html).toContain(`value="${String(duration)}"`);
    }
    expect(html).toContain('value="60" selected=""');
  });

  it("shows required-field validation for the empty state", () => {
    expect(lessonFormErrors({ studentId: "", title: "", date: "", start: "" })).toEqual({
      student_id: "Выберите ученика.",
      title: "Укажите название занятия.",
      date: "Укажите дату.",
      start: "Укажите время.",
    });
  });

  it("includes the weekly repeat controls", () => {
    const html = renderToStaticMarkup(<LessonCreateForm
      students={[{ id: "student-id", first_name: "Иван", last_name: "Смирнов", middle_name: null }]}
      timezone="Europe/Moscow"
      pending={false}
      onCancel={vi.fn()}
      onCreate={vi.fn()}
    />);
    expect(html).toContain("Повторять каждую неделю");
    expect(html).toContain("Повторять каждую неделю");
  });

  it("shows a dedicated error state instead of an empty student list", () => {
    const html = renderToStaticMarkup(<LessonCreateForm
      students={[]}
      studentsState="error"
      onRetryStudents={vi.fn()}
      timezone="Europe/Moscow"
      pending={false}
      onCancel={vi.fn()}
      onCreate={vi.fn()}
    />);

    expect(html).toContain("Не удалось загрузить список учеников");
    expect(html).toContain("Повторить");
    expect(html).toContain("Список учеников недоступен");
    expect(html).not.toContain("Нет доступных учеников. Подключите");
    expect(html).toMatch(/id="lesson-student"[^>]*disabled/);
  });

  it("shows a separate empty state when the teacher has no students", () => {
    const html = renderToStaticMarkup(<LessonCreateForm
      students={[]}
      studentsState="empty"
      timezone="Europe/Moscow"
      pending={false}
      onCancel={vi.fn()}
      onCreate={vi.fn()}
    />);

    expect(html).toContain("Нет доступных учеников. Подключите");
    expect(html).not.toContain("Не удалось загрузить список учеников");
    expect(html).toMatch(/id="lesson-student"[^>]*disabled/);
  });

  it("suggests five-minute intervals but accepts any valid minute", () => {
    const values = { studentId: "student-id", title: "  Математика  ", date: "20.10.2026", start: "15:30" };
    expect(Object.values(lessonFormErrors(values)).every((error) => !error)).toBe(true);
    expect(minuteSuggestions).toEqual(["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]);
    expect(lessonFormErrors({ ...values, start: "15:07" }).start).toBe("");
    expect(lessonFormErrors({ ...values, start: "15:59" }).start).toBe("");
    expect(lessonFormErrors({ ...values, start: "15:60" }).start).toBe("Укажите корректное время.");
    expect(lessonFormErrors({ ...values, start: "25:00" }).start).toBe("Укажите корректное время.");
    expect(parseLessonDate(values.date)).toBe("2026-10-20");
    expect(lessonFormErrors({ ...values, date: "31.02.2026" }).date).toBe("Укажите корректную дату.");
    expect(parseLessonDate("29.02.2028")).toBe("2028-02-29");
  });
});
