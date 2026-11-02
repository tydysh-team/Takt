import type { LessonLifecycleStatus } from "../../api/types";

export function lessonActions(status: LessonLifecycleStatus | "unknown" | null, isTeacher: boolean) {
  return {
    canReschedule: isTeacher && status === "planned",
    canCancel: isTeacher && (status === "planned" || status === "in_progress"),
    canUpdateAttendance: isTeacher && (status === "in_progress" || status === "completed"),
  };
}
