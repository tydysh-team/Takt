import { Temporal } from "@js-temporal/polyfill";

import type { LessonFormPayload } from "../../api/types";

export const MIN_SERIES_COUNT = 2;
export const MAX_SERIES_COUNT = 52;

export interface SeriesOccurrence {
  /** 1-based occurrence number shown to the teacher. */
  index: number;
  /** Absolute instant in the same format the backend accepts. */
  startsAt: string;
  /** Local ISO date in the selected timezone. */
  localDate: string;
  /** Local wall-clock time. */
  localTime: string;
}

export function seriesCountError(count: number): string | null {
  if (!Number.isInteger(count) || count < MIN_SERIES_COUNT || count > MAX_SERIES_COUNT) {
    return `Количество занятий должно быть целым числом от ${String(MIN_SERIES_COUNT)} до ${String(MAX_SERIES_COUNT)}.`;
  }
  return null;
}

/**
 * Adds calendar weeks in the selected timezone, not milliseconds. This keeps the
 * user's local wall time stable across DST transitions.
 */
export function addCalendarWeeks(startsAt: string, weeks: number, timezone: string): string {
  const zoned = Temporal.Instant.from(startsAt).toZonedDateTimeISO(timezone);
  return zoned.add({ weeks }).toInstant().toString();
}

export function seriesOccurrences(payload: LessonFormPayload, timezone: string): SeriesOccurrence[] {
  const count = payload.recurrence?.count ?? 1;
  return Array.from({ length: count }, (_, index) => {
    const startsAt = index === 0 ? payload.starts_at : addCalendarWeeks(payload.starts_at, index, timezone);
    const local = Temporal.Instant.from(startsAt).toZonedDateTimeISO(timezone);
    return {
      index: index + 1,
      startsAt,
      localDate: local.toPlainDate().toString(),
      localTime: local.toPlainTime().toString({ smallestUnit: "minute" }),
    };
  });
}

export function seriesSummary(payload: LessonFormPayload, timezone: string): string {
  if (!payload.recurrence) return "";
  const occurrences = seriesOccurrences(payload, timezone);
  const first = occurrences[0];
  const last = occurrences.at(-1);
  if (!first || !last) return "";
  return `Каждую неделю, ${String(payload.recurrence.count)} занятия: первое ${first.localDate} ${first.localTime}, последнее ${last.localDate} ${last.localTime}.`;
}
