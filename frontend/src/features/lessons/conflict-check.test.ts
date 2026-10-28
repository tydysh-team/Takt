import { describe, expect, it } from "vitest";

import type { LessonSeriesConflict } from "../../api/types";
import { describeSeriesConflicts, findLessonConflicts, seriesConflictCandidates } from "./conflict-check";

const lesson = (id: string, startsAt: string, durationMinutes = 60) => ({
  id,
  title: `Lesson ${id}`,
  startsAt,
  durationMinutes,
});

describe("findLessonConflicts", () => {
  it("detects partial, contained and equal overlaps", () => {
    const existing = [
      lesson("partial", "2026-11-01T10:00:00Z"),
      lesson("contained", "2026-11-01T10:15:00Z"),
      lesson("equal", "2026-11-01T11:00:00Z"),
    ];

    expect(findLessonConflicts({ startsAt: "2026-11-01T10:30:00Z", durationMinutes: 30 }, existing).map(({ id }) => id)).toEqual(["partial", "contained"]);
    expect(findLessonConflicts({ startsAt: "2026-11-01T11:00:00Z", durationMinutes: 60 }, existing.filter(({ id }) => id === "equal")).map(({ id }) => id)).toEqual(["equal"]);
  });

  it("does not treat touching intervals as conflicts", () => {
    const existing = [lesson("adjacent", "2026-11-01T10:00:00Z")];
    expect(findLessonConflicts({ startsAt: "2026-11-01T11:00:00Z", durationMinutes: 60 }, existing)).toEqual([]);
  });

  it("can exclude the lesson being moved", () => {
    const existing = [lesson("self", "2026-11-01T10:00:00Z")];
    expect(findLessonConflicts({ startsAt: "2026-11-01T10:00:00Z", durationMinutes: 60 }, existing, "self")).toEqual([]);
  });
});

describe("series conflicts", () => {
  const existing: LessonSeriesConflict = {
    type: "existing_lesson",
    series_index: 0,
    series_number: 1,
    series_starts_at: "2026-11-02T07:15:00Z",
    series_ends_at: "2026-11-02T08:15:00Z",
    lesson: {
      id: "lesson-1",
      title: "Математика",
      starts_at: "2026-11-02T07:15:00Z",
      ends_at: "2026-11-02T08:15:00Z",
      duration_minutes: 60,
      student: { id: "student-1", first_name: "Пётр", last_name: "Петров", middle_name: null },
    },
  };

  const internal: LessonSeriesConflict = {
    type: "within_series",
    series_index: 1,
    series_number: 2,
    series_starts_at: "2026-11-09T07:15:00Z",
    series_ends_at: "2026-11-09T08:15:00Z",
    other_series_index: 2,
    other_series_number: 3,
    other_series_starts_at: "2026-11-09T07:45:00Z",
    other_series_ends_at: "2026-11-09T08:45:00Z",
  };

  it("keeps series-shaped conflicts and ignores unrelated payloads", () => {
    expect(seriesConflictCandidates([existing, internal, { title: "single" }, null, "junk"])).toEqual([existing, internal]);
    expect(seriesConflictCandidates(undefined)).toEqual([]);
  });

  it("describes both existing-lesson and within-series conflicts", () => {
    const labels = describeSeriesConflicts([existing, internal], "Europe/Moscow");
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain("Занятие №1");
    expect(labels[0]).toContain("«Математика»");
    expect(labels[1]).toContain("Занятия №2 и №3 серии пересекаются");
  });
});
