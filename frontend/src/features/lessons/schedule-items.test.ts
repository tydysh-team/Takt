import { describe, expect, it } from "vitest";

import type { LessonReadDTO, PersonScheduleItem } from "../../api/types";
import { classifyStack, groupLessonStacks } from "./schedule-groups";
import { scheduleCalendarItems, scheduleItemTitle } from "./schedule-items";

const shared: LessonReadDTO = {
  id: "shared-id",
  title: "Математика",
  description: "Общая тема",
  starts_at: "2030-01-07T10:00:00Z",
  ends_at: "2030-01-07T11:00:00Z",
  duration_minutes: 60,
  status: "planned",
  is_rescheduled: false,
  attendance: "not_set",
  cancellation_reason: null,
  teacher: { id: "teacher", first_name: "Иван", last_name: "Иванов", middle_name: null },
  student: { id: "student", first_name: "Анна", last_name: "Петрова", middle_name: null },
};

describe("selected person's calendar items", () => {
  it("keeps shared lessons and renders third-party intervals without private fields", () => {
    const items: PersonScheduleItem[] = [
      { ...shared, type: "lesson" },
      { type: "busy", starts_at: "2030-01-07T10:30:00Z", ends_at: "2030-01-07T11:30:00Z" },
    ];
    const calendar = scheduleCalendarItems(items);
    const [sharedItem, busyItem, firstStack] = [calendar[0], calendar[1], groupLessonStacks(calendar)[0]];
    if (!sharedItem || !busyItem || !firstStack) throw new Error("expected calendar items and a stack");
    expect(sharedItem).toMatchObject({ type: "lesson", id: "shared-id", title: "Математика" });
    expect(busyItem).toMatchObject({ type: "busy", duration_minutes: 60 });
    expect(scheduleItemTitle(busyItem)).toBe("Занят");
    expect(busyItem).not.toHaveProperty("teacher");
    expect(busyItem).not.toHaveProperty("student");
    expect(busyItem).not.toHaveProperty("description");
    expect(groupLessonStacks(calendar)).toHaveLength(1);
    expect(classifyStack(firstStack).counted).toBe(2);
  });

  it("preserves adjacent intervals as separate cards", () => {
    const items: PersonScheduleItem[] = [
      { type: "busy", starts_at: "2030-01-07T10:00:00Z", ends_at: "2030-01-07T11:00:00Z" },
      { type: "busy", starts_at: "2030-01-07T11:00:00Z", ends_at: "2030-01-07T12:00:00Z" },
    ];
    const calendar = scheduleCalendarItems(items);
    expect(groupLessonStacks(calendar)).toHaveLength(2);
  });

  it("shows the occupied part of an interval crossing the week boundary", () => {
    const items: PersonScheduleItem[] = [
      { type: "busy", starts_at: "2030-01-06T23:30:00Z", ends_at: "2030-01-07T00:30:00Z" },
    ];
    const calendar = scheduleCalendarItems(items, "2030-01-07T00:00:00Z");
    expect(calendar[0]).toMatchObject({ starts_at: "2030-01-07T00:00:00Z", duration_minutes: 30 });
  });
});
