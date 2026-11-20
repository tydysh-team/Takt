import { Temporal } from "@js-temporal/polyfill";

import type { LessonAttendance, LessonStatus, ProgressPeriod } from "../../api/types";
import { dayStartUtc } from "../../shared/lesson-time";

const STATUS_LABELS: Record<LessonStatus, string> = {
  planned: "Запланировано",
  in_progress: "Идёт",
  completed: "Завершено",
  cancelled: "Отменено",
};

const ATTENDANCE_LABELS: Record<LessonAttendance, string> = {
  present: "Присутствовал",
  absent: "Отсутствовал",
  not_set: "Не отмечено",
};

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat("ru-RU");

export function statusLabel(status: LessonStatus): string {
  return STATUS_LABELS[status];
}

export function attendanceLabel(attendance: LessonAttendance): string {
  return ATTENDANCE_LABELS[attendance];
}

export function formatCount(value: number): string {
  return countFormat.format(value);
}

export function formatPercent(value: number | null): string {
  return value === null ? "N/A" : `${numberFormat.format(value)} %`;
}

export function formatGrade(value: number | null): string {
  return value === null ? "N/A" : numberFormat.format(value);
}

export function periodQuery(period: ProgressPeriod): string {
  return `date_from=${encodeURIComponent(period.date_from)}&date_to=${encodeURIComponent(period.date_to)}`;
}

export function isValidPeriod(period: ProgressPeriod): boolean {
  try {
    return Temporal.Instant.from(period.date_from).epochNanoseconds
      < Temporal.Instant.from(period.date_to).epochNanoseconds;
  } catch {
    return false;
  }
}

export function monthPeriod(
  timezone: string,
  reference: Temporal.Instant = Temporal.Now.instant(),
): ProgressPeriod {
  const today = reference.toZonedDateTimeISO(timezone).toPlainDate();
  return periodForMonths(today, 0, timezone);
}

export function previousMonthPeriod(
  timezone: string,
  reference: Temporal.Instant = Temporal.Now.instant(),
): ProgressPeriod {
  const today = reference.toZonedDateTimeISO(timezone).toPlainDate();
  return periodForMonths(today, -1, timezone);
}

function periodForMonths(
  today: Temporal.PlainDate,
  offset: number,
  timezone: string,
): ProgressPeriod {
  const start = today.with({ day: 1 }).add({ months: offset });
  const end = start.add({ months: 1 });
  return { date_from: dayStartUtc(start, timezone), date_to: dayStartUtc(end, timezone) };
}

export function formatPeriodLabel(period: ProgressPeriod, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: timezone,
    });
    const start = formatter.format(new Date(period.date_from));
    const inclusiveEnd = Temporal.Instant.from(period.date_to).subtract({ nanoseconds: 1 });
    const end = formatter.format(new Date(inclusiveEnd.toString()));
    return `${start} — ${end}`;
  } catch {
    return "Период не задан";
  }
}

export function periodInputs(period: ProgressPeriod, timezone: string): { from: string; to: string } {
  try {
    const from = Temporal.Instant.from(period.date_from).toZonedDateTimeISO(timezone).toPlainDate();
    const inclusiveEnd = Temporal.Instant.from(period.date_to).subtract({ nanoseconds: 1 });
    const to = inclusiveEnd.toZonedDateTimeISO(timezone).toPlainDate();
    return { from: from.toString(), to: to.toString() };
  } catch {
    return { from: "", to: "" };
  }
}

export function inputsPeriod(from: string, to: string, timezone: string): ProgressPeriod | null {
  try {
    const start = Temporal.PlainDate.from(from);
    const inclusiveEnd = Temporal.PlainDate.from(to);
    if (Temporal.PlainDate.compare(start, inclusiveEnd) > 0) return null;
    return {
      date_from: dayStartUtc(start, timezone),
      date_to: dayStartUtc(inclusiveEnd.add({ days: 1 }), timezone),
    };
  } catch {
    return null;
  }
}
