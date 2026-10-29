import { describe, expect, it } from "vitest";

import { dayStartUtc, formatLessonTime, lessonEndUtc, lessonStartUtc, localDate, weekDays } from "./lesson-time";

describe("lesson time in profile timezone", () => {
  it("converts teacher wall time to an absolute instant and shows each user's time", () => {
    const startsAt = lessonStartUtc("2026-10-20", "15:07", "Europe/Moscow");
    expect(startsAt).toBe("2026-10-20T12:07:00Z");
    expect(formatLessonTime(startsAt, 95, "Europe/Moscow")).toBe("15:07 — 16:42");
    expect(formatLessonTime(startsAt, 95, "Europe/Warsaw")).toBe("14:07 — 15:42");
    expect(lessonEndUtc(startsAt, 95)).toBe("2026-10-20T13:42:00Z");
  });

  it("rejects nonexistent and ambiguous DST wall times", () => {
    expect(() => lessonStartUtc("2026-03-29", "02:30", "Europe/Warsaw")).toThrow();
    expect(() => lessonStartUtc("2026-10-25", "02:30", "Europe/Warsaw")).toThrow();
  });

  it("uses local week boundaries even on a DST transition", () => {
    const days = weekDays("2026-03-29T12:00:00Z", 0, "Europe/Warsaw");
    expect(days[0]?.toString()).toBe("2026-03-23");
    const sunday = days[6];
    if (!sunday) throw new Error("Expected Sunday");
    expect(dayStartUtc(sunday, "Europe/Warsaw")).toBe("2026-03-28T23:00:00Z");
    expect(dayStartUtc(sunday.add({ days: 1 }), "Europe/Warsaw")).toBe("2026-03-29T22:00:00Z");
    expect(localDate("2026-03-29T22:30:00Z", "Europe/Warsaw")).toBe("2026-03-30");
  });

  it("keeps the full duration when a lesson crosses midnight", () => {
    const startsAt = lessonStartUtc("2026-10-29", "23:25", "Europe/Minsk");
    expect(formatLessonTime(startsAt, 60, "Europe/Minsk")).toBe("23:25 — 00:25");
    expect(localDate(lessonEndUtc(startsAt, 60), "Europe/Minsk")).toBe("2026-10-30");
  });
});
