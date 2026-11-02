import { describe, expect, it } from "vitest";

import type { LessonReadDTO } from "../../api/types";
import { filterLessonsForSchedule, schedulePresentation } from "./schedule-context";

function lesson(id: string, teacherId: string, studentId: string): LessonReadDTO {
  return {
    id,
    title: `Занятие ${id}`,
    description: null,
    starts_at: "2026-11-02T09:00:00Z",
    ends_at: "2026-11-02T10:00:00Z",
    duration_minutes: 60,
    status: "planned",
    is_rescheduled: false,
    attendance: "not_set",
    cancellation_reason: null,
    teacher: { id: teacherId, first_name: "Иван", last_name: teacherId, middle_name: null },
    student: { id: studentId, first_name: "Анна", last_name: studentId, middle_name: null },
  };
}

const lessons = [
  lesson("own-selected", "teacher-selected", "student-current"),
  lesson("own-other", "teacher-other", "student-current"),
  lesson("other-user", "teacher-selected", "student-other"),
];

describe("schedulePresentation", () => {
  it("labels the student's personal schedule", () => {
    expect(schedulePresentation("STUDENT", {})).toMatchObject({
      title: "Моё расписание",
      showPersonalScheduleLink: false,
    });
  });

  it("identifies a selected teacher and offers a way back to the personal schedule", () => {
    expect(schedulePresentation("STUDENT", { teacher: { id: "teacher-selected", name: "Иван Иванов" } })).toEqual({
      title: "Расписание преподавателя",
      description: "Иван Иванов · Только ваши занятия с этим преподавателем.",
      showPersonalScheduleLink: true,
    });
  });

  it("keeps the teacher's general calendar heading", () => {
    expect(schedulePresentation("TEACHER", {}).title).toBe("Неделя занятий");
  });
});

describe("filterLessonsForSchedule", () => {
  it("keeps all API-authorized lessons in the student's personal schedule", () => {
    expect(filterLessonsForSchedule(lessons, "STUDENT", {}, "student-current").map((item) => item.id)).toEqual([
      "own-selected",
      "own-other",
    ]);
  });

  it("shows only the current student's lessons with the selected teacher", () => {
    expect(filterLessonsForSchedule(lessons, "STUDENT", {
      teacher: { id: "teacher-selected", name: "Иван Иванов" },
    }, "student-current").map((item) => item.id)).toEqual(["own-selected"]);
  });

  it("shows only the selected student in the teacher's profile calendar", () => {
    expect(filterLessonsForSchedule(lessons, "TEACHER", {
      student: { id: "student-current", name: "Анна Петрова" },
    }).map((item) => item.id)).toEqual(["own-selected", "own-other"]);
  });
});
