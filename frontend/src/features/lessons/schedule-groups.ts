import type { LessonReadDTO } from "../../api/types";

export interface LessonStack {
  /** Id of the first lesson in the stack; unique inside one day. */
  id: string;
  lessons: LessonReadDTO[];
  /** Epoch milliseconds of the earliest lesson start. */
  start: number;
  /** Epoch milliseconds of the latest lesson end. */
  end: number;
}

function durationMs(lesson: LessonReadDTO): number {
  const minutes = Number.isFinite(lesson.duration_minutes) && lesson.duration_minutes > 0
    ? lesson.duration_minutes
    : 60;
  return minutes * 60_000;
}

/**
 * Groups lessons that overlap in time into vertical stacks.
 * Lessons that only touch (one ends exactly when the next starts) stay separate.
 */
export function groupLessonStacks(lessons: LessonReadDTO[]): LessonStack[] {
  const sorted = [...lessons].sort((a, b) => {
    const difference = Date.parse(a.starts_at) - Date.parse(b.starts_at);
    return difference !== 0 ? difference : a.id.localeCompare(b.id);
  });

  const stacks: LessonStack[] = [];

  for (const lesson of sorted) {
    const start = Date.parse(lesson.starts_at);
    const end = start + durationMs(lesson);
    const current = stacks[stacks.length - 1];

    if (current && start < current.end) {
      current.lessons.push(lesson);
      current.end = Math.max(current.end, end);
    } else {
      stacks.push({ id: lesson.id, lessons: [lesson], start, end });
    }
  }

  return stacks;
}

export function stackDurationMinutes(stack: LessonStack): number {
  return Math.max(1, Math.round((stack.end - stack.start) / 60_000));
}
