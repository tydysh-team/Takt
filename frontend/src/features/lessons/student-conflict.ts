import { ApiError } from "../../api/client";
import { formatConflictRange } from "./conflict-check";

const warning = "Ученик уже занят у другого преподавателя в выбранное время. Выберите другое время";

export function studentScheduleConflictMessage(error: unknown, timezone: string): string | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== "student_schedule_conflict") return null;
  const conflicts = error.context?.conflicts;
  if (!Array.isArray(conflicts)) return warning;
  const ranges = conflicts.flatMap((item): string[] => {
    if (!item || typeof item !== "object") return [];
    const { starts_at, ends_at, series_number } = item as Record<string, unknown>;
    if (typeof starts_at !== "string" || typeof ends_at !== "string") return [];
    const duration = (Date.parse(ends_at) - Date.parse(starts_at)) / 60_000;
    if (!Number.isFinite(duration) || duration <= 0) return [];
    const label = formatConflictRange(starts_at, duration, timezone);
    return [typeof series_number === "number" && Number.isInteger(series_number)
      ? `Занятие №${String(series_number)}: ${label}` : label];
  });
  return ranges.length ? `${warning}. Занято: ${ranges.join("; ")}` : warning;
}
