import { describe, expect, it } from "vitest";

import type { LessonReadDTO } from "../../api/types";
import { isLessonAttendance, isLessonStatus, lessonAttendanceLabel, lessonStatus, lessonStatusLabel } from "./lesson-status";

const lesson = (overrides: Omit<Partial<LessonReadDTO>, "status" | "attendance"> & {
  status?: LessonReadDTO["status"] | undefined;
  attendance?: LessonReadDTO["attendance"] | undefined;
}): LessonReadDTO => {
  const { status, attendance, ...rest } = overrides;
  const result: LessonReadDTO = {
    id: "lesson-id",
    title: "Математика",
    description: null,
    starts_at: "2026-11-01T10:00:00Z",
    ends_at: "2026-11-01T11:00:00Z",
    duration_minutes: 60,
    status: "planned",
    is_rescheduled: false,
    attendance: "not_set",
    cancellation_reason: null,
    teacher: { id: "teacher-id", first_name: "Иван", last_name: "Иванов", middle_name: null },
    student: { id: "student-id", first_name: "Пётр", last_name: "Петров", middle_name: null },
    ...rest,
    ...(status === undefined ? {} : { status }),
    ...(attendance === undefined ? {} : { attendance }),
  };
  return result;
};

describe("lessonStatus", () => {
  it("uses the API status even when the client clock is wrong", () => {
    const planned = lesson({ status: "planned", starts_at: "2026-01-01T10:00:00Z" });
    const inProgress = lesson({ status: "in_progress", starts_at: "2030-01-01T10:00:00Z" });
    expect(lessonStatus(planned)).toBe("planned");
    expect(lessonStatus(inProgress)).toBe("in_progress");
    expect(lessonStatusLabel(inProgress)).toBe("Идёт");
    expect(lessonStatus(lesson({ status: "cancelled" }))).toBe("cancelled");
    expect(lessonStatus(lesson({ status: "completed" }))).toBe("completed");
  });

  it("never silently substitutes an invalid or missing status", () => {
    const missingStatus = { ...lesson({}), status: undefined } as unknown as LessonReadDTO;
    expect(lessonStatus(missingStatus)).toBe("unknown");
    expect(lessonStatus(lesson({ status: "unknown-status" as LessonReadDTO["status"] }))).toBe("unknown");
    expect(lessonStatusLabel(missingStatus)).toBe("Статус неизвестен");
    expect(isLessonStatus(undefined)).toBe(false);
    expect(isLessonStatus("planned")).toBe(true);
  });

  it("keeps the API status after reschedule", () => {
    const rescheduled = lesson({ starts_at: "2026-11-08T09:00:00Z", status: "planned", is_rescheduled: true });
    expect(lessonStatus(rescheduled)).toBe("planned");
  });
});

describe("attendance representation", () => {
  it("labels valid values and safely handles unknown ones", () => {
    expect(lessonAttendanceLabel(lesson({ attendance: "not_set" }))).toBe("Не отмечено");
    expect(lessonAttendanceLabel(lesson({ attendance: "present" }))).toBe("Присутствовал");
    expect(lessonAttendanceLabel(lesson({ attendance: "absent" }))).toBe("Отсутствовал");
    expect(lessonAttendanceLabel(lesson({ attendance: "late" as LessonReadDTO["attendance"] }))).toBe("Статус посещения неизвестен");
    expect(isLessonAttendance("present")).toBe(true);
    expect(isLessonAttendance("late")).toBe(false);
  });
});
