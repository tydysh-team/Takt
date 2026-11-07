import type { LessonReadDTO, PersonScheduleItem } from "../../api/types";
import { lessonStatus } from "./lesson-status";

export type ScheduleCalendarItem = (LessonReadDTO & { type: "lesson" }) | {
  type: "busy";
  id: string; // Local rendering key; the API never supplies a foreign lesson ID.
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
};

export function scheduleCalendarItems(
  items: PersonScheduleItem[] | LessonReadDTO[], periodStart?: string,
): ScheduleCalendarItem[] {
  return items.map((item, index) => {
    if ("type" in item && item.type === "busy") {
      const startsAt = periodStart && Date.parse(item.starts_at) < Date.parse(periodStart)
        ? periodStart : item.starts_at;
      return {
        ...item,
        id: `busy-${String(index)}`,
        starts_at: startsAt,
        duration_minutes: Math.max(1, (Date.parse(item.ends_at) - Date.parse(startsAt)) / 60_000),
      };
    }
    return { ...item, type: "lesson" as const };
  });
}

export function scheduleItemStatus(item: ScheduleCalendarItem) {
  return item.type === "busy" ? "planned" : lessonStatus(item);
}

export function scheduleItemTitle(item: ScheduleCalendarItem) {
  return item.type === "busy" ? "Занят" : item.title;
}
