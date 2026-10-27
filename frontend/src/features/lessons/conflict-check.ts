import { Temporal } from "@js-temporal/polyfill";

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
