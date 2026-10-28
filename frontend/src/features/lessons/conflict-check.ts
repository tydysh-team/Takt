import { Temporal } from "@js-temporal/polyfill";

import type { LessonSeriesConflict } from "../../api/types";

export interface LessonConflictCandidate {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
}

export function formatConflictRange(startsAt: string, durationMinutes: number, timezone: string): string {
  const start = new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(startsAt));
  const end = new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(Date.parse(startsAt) + durationMinutes * 60_000));
  return start + " — " + end;
}

/**
 * Series conflicts arrive in a different shape than single-lesson conflicts:
 * each item describes one occurrence of the series and either references an
 * existing lesson or another occurrence inside the same series.
 */
export function seriesConflictCandidates(value: unknown): LessonSeriesConflict[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LessonSeriesConflict => {
    if (!item || typeof item !== "object" || !("type" in item)) return false;
    const type = (item as { type?: unknown }).type;
    return type === "existing_lesson" || type === "within_series";
  });
}

export function describeSeriesConflicts(conflicts: LessonSeriesConflict[], timezone: string): string[] {
  return conflicts.map((item) => {
    if (item.type === "existing_lesson") {
      return `Занятие №${String(item.series_number)}: «${item.lesson.title}» — ${formatConflictRange(item.lesson.starts_at, item.lesson.duration_minutes, timezone)}`;
    }
    const durationMinutes = Math.max(1, Math.round((Date.parse(item.series_ends_at) - Date.parse(item.series_starts_at)) / 60_000));
    return `Занятия №${String(item.series_number)} и №${String(item.other_series_number)} серии пересекаются — ${formatConflictRange(item.series_starts_at, durationMinutes, timezone)}`;
  });
}

export function findLessonConflicts<T extends LessonConflictCandidate>(
  candidate: Pick<LessonConflictCandidate, "startsAt" | "durationMinutes">,
  lessons: T[],
  excludeId?: string,
): T[] {
  const candidateStart = Temporal.Instant.from(candidate.startsAt).epochMilliseconds;
  const candidateEnd = candidateStart + candidate.durationMinutes * 60_000;

  return lessons.filter((lesson) => {
    if (lesson.id === excludeId) return false;
    const start = Temporal.Instant.from(lesson.startsAt).epochMilliseconds;
    const end = start + lesson.durationMinutes * 60_000;
    return candidateStart < end && candidateEnd > start;
  });
}
