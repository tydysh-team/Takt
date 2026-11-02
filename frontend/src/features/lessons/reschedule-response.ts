import { ApiError } from "../../api/client";
import type { LessonConflict } from "../../api/types";

export function rescheduleConflicts(error: unknown): LessonConflict[] | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== "lesson_time_conflict") {
    return null;
  }
  const value = error.context?.conflicts;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LessonConflict =>
    Boolean(item) && typeof item === "object" && "id" in item && "title" in item && "starts_at" in item,
  );
}
