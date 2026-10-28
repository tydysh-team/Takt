import { describe, expect, it } from "vitest";

import type { LessonReadDTO } from "../../api/types";
import { effectiveLessonStatus, isLessonAttendance, isLessonStatus, lessonAttendanceLabel, lessonStatusLabel } from "./lesson-status";

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

describe("effectiveLessonStatus", () => {
  it("uses exact boundaries and time-derived statuses", () => {
    const base = lesson({ status: "planned" });
    expect(effectiveLessonStatus(base, new Date("2026-11-01T09:59:59Z"))).toBe("planned");
    expect(effectiveLessonStatus(base, new Date("2026-11-01T10:00:00Z"))).toBe("in_progress");
    expect(effectiveLessonStatus(base, new Date("2026-11-01T10:59:59Z"))).toBe("in_progress");
    expect(effectiveLessonStatus(base, new Date("2026-11-01T11:00:00Z"))).toBe("completed");
  });

  it("gives cancelled priority and keeps it over time", () => {
    const cancelled = lesson({ status: "cancelled", starts_at: "2026-10-01T10:00:00Z" });
    expect(effectiveLessonStatus(cancelled, new Date("2026-12-01T10:00:00Z"))).toBe("cancelled");
  });

  it("never silently substitutes an invalid or missing status", () => {
    const missingStatus = { ...lesson({}), status: undefined } as unknown as LessonReadDTO;
    expect(effectiveLessonStatus(missingStatus)).toBe("unknown");
    expect(effectiveLessonStatus(lesson({ status: "unknown-status" as LessonReadDTO["status"] }))).toBe("unknown");
    expect(lessonStatusLabel(missingStatus)).toBe("Статус неизвестен");
    expect(isLessonStatus(undefined)).toBe(false);
    expect(isLessonStatus("planned")).toBe(true);
  });

  it("uses current time after reschedule without losing the flag", () => {
    const rescheduled = lesson({ starts_at: "2026-11-08T09:00:00Z", status: "planned", is_rescheduled: true });
    expect(effectiveLessonStatus(rescheduled, new Date("2026-11-08T08:59:59Z"))).toBe("planned");
    expect(effectiveLessonStatus(rescheduled, new Date("2026-11-08T09:00:00Z"))).toBe("in_progress");
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
