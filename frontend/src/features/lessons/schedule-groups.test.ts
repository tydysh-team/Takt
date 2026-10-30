import { describe, expect, it } from "vitest";

import type { LessonReadDTO } from "../../api/types";
import { classifyStack, groupLessonStacks, type LessonStack } from "./schedule-groups";

const NOW = new Date("2026-11-01T12:00:00Z");

const lesson = (
  id: string,
  startHour: number,
  startMinute: number,
  durationMinutes: number,
  status: LessonReadDTO["status"],
): LessonReadDTO => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const startsAt = `2026-11-01T${pad(startHour)}:${pad(startMinute)}:00Z`;
  const endsAt = new Date(Date.parse(startsAt) + durationMinutes * 60_000).toISOString();
  return {
    id,
    title: `Урок ${id}`,
    description: null,
    starts_at: startsAt,
    ends_at: endsAt,
    duration_minutes: durationMinutes,
    status,
    is_rescheduled: false,
    attendance: "not_set",
    cancellation_reason: null,
    teacher: { id: "teacher", first_name: "Иван", last_name: "Иванов", middle_name: null },
    student: { id: "student", first_name: "Пётр", last_name: "Петров", middle_name: null },
  };
};

/** Groups the given lessons and returns the single expected stack. */
const singleStack = (lessons: LessonReadDTO[]): LessonStack => {
  const stacks = groupLessonStacks(lessons);
  expect(stacks).toHaveLength(1);
  const stack = stacks[0];
  if (!stack) throw new Error("expected exactly one lesson stack");
  return stack;
};

describe("groupLessonStacks", () => {
  it("groups overlapping lessons but keeps touching intervals separate", () => {
    const overlapping = groupLessonStacks([lesson("a", 13, 0, 60, "planned"), lesson("b", 13, 30, 60, "planned")]);
    expect(overlapping).toHaveLength(1);
    expect(overlapping[0]?.lessons).toHaveLength(2);

    const touching = groupLessonStacks([lesson("a", 13, 0, 60, "planned"), lesson("b", 14, 0, 60, "planned")]);
    expect(touching).toHaveLength(2);
  });
});

describe("classifyStack", () => {
  it("flags two actionable overlapping lessons as a warning", () => {
    const info = classifyStack(singleStack([lesson("a", 13, 0, 60, "planned"), lesson("b", 13, 30, 60, "planned")]), NOW);
    expect(info.kind).toBe("warning");
    expect(info.counted).toBe(2);
    expect(info.liveCount).toBe(2);
    expect(info.cancelledLessons).toHaveLength(0);
  });

  it("treats completed-only overlaps as neutral, not a warning", () => {
    const info = classifyStack(singleStack([lesson("a", 9, 0, 60, "planned"), lesson("b", 9, 30, 60, "planned")]), NOW);
    expect(info.kind).toBe("neutral");
    expect(info.counted).toBe(2);
    expect(info.liveCount).toBe(0);
  });

  it("excludes cancelled lessons from the count and from warnings", () => {
    const info = classifyStack(singleStack([
      lesson("a", 13, 0, 60, "planned"),
      lesson("b", 13, 30, 60, "planned"),
      lesson("c", 13, 15, 60, "cancelled"),
      lesson("d", 13, 45, 60, "cancelled"),
    ]), NOW);
    expect(info.cancelledLessons).toHaveLength(2);
    expect(info.counted).toBe(2);
    expect(info.liveCount).toBe(2);
    expect(info.kind).toBe("warning");
  });

  it("reports no conflict when fewer than two non-cancelled lessons overlap", () => {
    const info = classifyStack(singleStack([
      lesson("a", 13, 0, 60, "planned"),
      lesson("c", 13, 30, 60, "cancelled"),
      lesson("d", 13, 15, 60, "cancelled"),
    ]), NOW);
    expect(info.counted).toBe(1);
    expect(info.cancelledLessons).toHaveLength(2);
    expect(info.kind).toBe("none");
  });

  it("warns for in-progress overlaps", () => {
    const now = new Date("2026-11-01T13:30:00Z");
    const info = classifyStack(singleStack([lesson("a", 13, 0, 60, "planned"), lesson("b", 13, 30, 60, "planned")]), now);
    expect(info.liveCount).toBe(2);
    expect(info.kind).toBe("warning");
  });
});
