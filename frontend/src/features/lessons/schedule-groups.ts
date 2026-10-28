import type { LessonReadDTO } from "../../api/types";
import { effectiveLessonStatus } from "./lesson-status";

export interface LessonStack {
  /** Id of the first lesson in the stack; unique inside one day. */
  id: string;
  lessons: LessonReadDTO[];
  /** Epoch milliseconds of the earliest lesson start. */
  start: number;
  /** Epoch milliseconds of the latest lesson end. */
  end: number;
}

export type StackConflictKind = "warning" | "neutral" | "none";

export interface StackConflictInfo {
  kind: StackConflictKind;
  /** Non-cancelled lessons (planned / in_progress / completed / unknown). */
  countedLessons: LessonReadDTO[];
  /** Lessons that are still actionable: planned / in_progress / unknown. */
  liveLessons: LessonReadDTO[];
  cancelledLessons: LessonReadDTO[];
  /** Number of non-cancelled lessons — drives the conflict badge. */
  counted: number;
  liveCount: number;
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

/**
 * Splits a time-overlap stack into cancelled vs. counted lessons and decides how
 * the overlap should be presented. Cancelled lessons never count toward a conflict
 * (US-04: cancelled lessons are excluded from conflict-check). Completed lessons
 * still overlap in time but are historical, so they surface as a neutral overlap
 * instead of a warning. A real scheduling conflict (warning) needs at least two
 * lessons that are still actionable (planned / in_progress).
 */
export function classifyStack(stack: LessonStack, now: Date = new Date()): StackConflictInfo {
  const countedLessons: LessonReadDTO[] = [];
  const liveLessons: LessonReadDTO[] = [];
  const cancelledLessons: LessonReadDTO[] = [];

  for (const lesson of stack.lessons) {
    const status = effectiveLessonStatus(lesson, now);
    if (status === "cancelled") {
      cancelledLessons.push(lesson);
      continue;
    }
    countedLessons.push(lesson);
    // `unknown` is treated as live so an unrecognised status can still raise a warning.
    if (status !== "completed") liveLessons.push(lesson);
  }

  const counted = countedLessons.length;
  const liveCount = liveLessons.length;
  const kind: StackConflictKind = liveCount >= 2 ? "warning" : counted >= 2 ? "neutral" : "none";

  return { kind, countedLessons, liveLessons, cancelledLessons, counted, liveCount };
}
