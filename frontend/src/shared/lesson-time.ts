import { Temporal } from "@js-temporal/polyfill";

export function localDate(instant: string, timezone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDate().toString();
}

export function localDayOfWeek(instant: string, timezone: string): number {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).dayOfWeek;
}

export function weekDays(now: string, offset: number, timezone: string) {
  const today = Temporal.Instant.from(now).toZonedDateTimeISO(timezone).toPlainDate();
  const monday = today.subtract({ days: today.dayOfWeek - 1 }).add({ weeks: offset });
  return Array.from({ length: 7 }, (_, index) => monday.add({ days: index }));
}

export function dayStartUtc(date: Temporal.PlainDate, timezone: string): string {
  return date.toZonedDateTime(timezone).toInstant().toString();
}

export function lessonStartUtc(date: string, time: string, timezone: string): string {
  return Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(timezone, { disambiguation: "reject" }).toInstant().toString();
}

export function lessonEndUtc(startsAt: string, durationMinutes: number): string {
  const minutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60;
  return Temporal.Instant.from(startsAt).add({ minutes }).toString();
}

export function formatLessonTime(startsAt: string, durationMinutes: number, timezone: string): string {
  const format = new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  return `${format.format(new Date(startsAt))} — ${format.format(new Date(lessonEndUtc(startsAt, durationMinutes)))}`;
}

export function formatLessonDateTime(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(startsAt));
}
