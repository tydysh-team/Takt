import { describe, expect, it } from "vitest";

import { findLessonConflicts } from "./conflict-check";

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
