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

export function lessonStatus(lesson: LessonReadDTO): LessonLifecycleStatus | "unknown" {
  return isLessonStatus(lesson.status) ? lesson.status : "unknown";
}

export function lessonStatusLabel(lesson: LessonReadDTO): string {
  const status = lessonStatus(lesson);
  return status === "unknown" ? "Статус неизвестен" : lessonStatusLabels[status];
}
