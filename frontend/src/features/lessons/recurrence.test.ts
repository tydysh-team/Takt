import { describe, expect, it } from "vitest";

import type { LessonCreatePayload } from "../../api/types";
import { addCalendarWeeks, seriesCountError, seriesOccurrences, seriesSummary } from "./recurrence";

const payload = (recurrence?: LessonCreatePayload["recurrence"]): LessonCreatePayload => ({
  student_id: "student-id",
  title: "Математика",
  description: null,
  starts_at: "2026-03-02T12:00:00Z",
  duration_minutes: 60,
  ...(recurrence ? { recurrence } : {}),
});

describe("weekly recurrence", () => {
  it("adds calendar weeks instead of milliseconds", () => {
    expect(addCalendarWeeks("2026-03-02T12:00:00Z", 0, "Europe/Warsaw")).toBe("2026-03-02T12:00:00Z");
    // Europe/Warsaw enters DST on 2026-03-29, so the local time is still 13:00 on 2026-03-23.
    expect(addCalendarWeeks("2026-03-02T12:00:00Z", 3, "Europe/Warsaw")).toBe("2026-03-23T12:00:00Z");
    // Across the DST transition, the absolute instant shifts while wall time stays 13:00.
    expect(addCalendarWeeks("2026-03-23T12:00:00Z", 1, "Europe/Warsaw")).toBe("2026-03-30T11:00:00Z");
  });

  it("keeps local wall time through a DST transition", () => {
    const occurrences = seriesOccurrences(payload({ frequency: "weekly", count: 4 }), "Europe/Warsaw");
    expect(occurrences.map(({ localDate, localTime }) => `${localDate} ${localTime}`)).toEqual([
      "2026-03-02 13:00",
      "2026-03-09 13:00",
      "2026-03-16 13:00",
      "2026-03-23 13:00",
    ]);
  });

  it("validates the sprint 2 count boundary", () => {
    expect(seriesCountError(1)).toContain("от 2 до 52");
    expect(seriesCountError(53)).toContain("от 2 до 52");
    expect(seriesCountError(2.5)).toContain("целым");
    expect(seriesCountError(2)).toBeNull();
    expect(seriesCountError(52)).toBeNull();
  });

  it("builds an unambiguous summary with the first and last occurrence", () => {
    expect(seriesSummary(payload({ frequency: "weekly", count: 3 }), "Europe/Warsaw")).toBe(
      "Каждую неделю, 3 занятия: первое 2026-03-02 13:00, последнее 2026-03-16 13:00.",
    );
  });
});
