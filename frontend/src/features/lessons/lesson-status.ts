import type { LessonAttendance, LessonLifecycleStatus, LessonReadDTO } from "../../api/types";

export const lessonStatusLabels: Record<LessonLifecycleStatus, string> = {
  planned: "Запланировано",
  in_progress: "Идёт",
  completed: "Завершено",
  cancelled: "Отменено",
};

export const lessonAttendanceLabels: Record<LessonAttendance, string> = {
  not_set: "Не отмечено",
  present: "Присутствовал",
  absent: "Отсутствовал",
};

export function isLessonStatus(value: unknown): value is LessonLifecycleStatus {
  return value === "planned" || value === "in_progress" || value === "completed" || value === "cancelled";
}

export function isLessonAttendance(value: unknown): value is LessonAttendance {
  return value === "not_set" || value === "present" || value === "absent";
}

export function lessonAttendanceLabel(lesson: LessonReadDTO): string {
  return isLessonAttendance(lesson.attendance) ? lessonAttendanceLabels[lesson.attendance] : "Статус посещения неизвестен";
}

/**
 * Determines the lifecycle status for the temporary local US-05…US-09 layer.
 * `cancelled` is persistent and has priority; `planned`/`in_progress`/`completed`
 * are time-derived. An invalid persisted status is never silently replaced.
 */
export function effectiveLessonStatus(
  lesson: LessonReadDTO,
  now: Date = new Date(),
): LessonLifecycleStatus | "unknown" {
  if (!isLessonStatus(lesson.status)) return "unknown";
  if (lesson.status === "cancelled") return "cancelled";

  const start = Date.parse(lesson.starts_at);
  if (!Number.isFinite(start) || !Number.isFinite(lesson.duration_minutes) || lesson.duration_minutes <= 0) {
    return "unknown";
  }
  const end = start + lesson.duration_minutes * 60_000;
  const current = now.getTime();
  return current < start ? "planned" : current < end ? "in_progress" : "completed";
}

export function lessonStatusLabel(lesson: LessonReadDTO, now: Date = new Date()): string {
  const status = effectiveLessonStatus(lesson, now);
  return status === "unknown" ? "Статус неизвестен" : lessonStatusLabels[status];
}
