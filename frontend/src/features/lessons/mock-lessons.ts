import type { LessonCreatePayload, LessonReadDTO, StudentRef, TeacherRef } from "../../api/types";

export type MockLessonState = Pick<LessonReadDTO, "starts_at" | "status" | "attendance" | "rescheduled"> & {
  id: string;
  title?: string;
  duration_minutes?: number;
  student?: StudentRef;
  teacher?: TeacherRef;
  description?: string | null;
};
const STORAGE_KEY = "takt.mock.lessons.v1";

function isStandaloneLesson(value: MockLessonState): value is MockLessonState & Required<Pick<LessonReadDTO, "title" | "duration_minutes" | "student" | "teacher">> {
  return typeof value.title === "string"
    && Number.isFinite(value.duration_minutes) && (value.duration_minutes ?? 0) > 0
    && Boolean(value.student?.id) && Boolean(value.teacher?.id)
    && !Number.isNaN(Date.parse(value.starts_at));
}

function read(): MockLessonState[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MockLessonState => Boolean(item) && typeof item === "object" && typeof (item as MockLessonState).id === "string");
  } catch { return []; }
}
function write(items: MockLessonState[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

export function saveMockState(id: string, patch: Partial<MockLessonState>) {
  const items = read(); const index = items.findIndex((item) => item.id === id);
  const existing = items[index];
  if (!existing) items.push({ ...patch, id, starts_at: patch.starts_at ?? new Date().toISOString() });
  else items[index] = { ...existing, ...patch, id: existing.id, starts_at: patch.starts_at ?? existing.starts_at };
  write(items);
}

export function overlayMockLessons(lessons: LessonReadDTO[]): LessonReadDTO[] {
  const stored = read();
  const backendIds = new Set(lessons.map((lesson) => lesson.id));
  const states = new Map(stored.filter((item) => backendIds.has(item.id)).map((item) => [item.id, item]));
  const safeBackendLessons = lessons.filter((lesson) => Number.isFinite(lesson.duration_minutes) && lesson.duration_minutes > 0);
  const standaloneMocks = stored.filter((item) => !backendIds.has(item.id) && isStandaloneLesson(item));
  return safeBackendLessons.map((lesson) => ({ ...lesson, ...states.get(lesson.id), duration_minutes: lesson.duration_minutes }))
    .concat(standaloneMocks as LessonReadDTO[]);
}

export function effectiveStatus(lesson: LessonReadDTO, now = Date.now()): "planned" | "in_progress" | "completed" | "cancelled" {
  if (lesson.status === "cancelled") return "cancelled";
  const start = Date.parse(lesson.starts_at); const end = start + lesson.duration_minutes * 60_000;
  return now < start ? "planned" : now < end ? "in_progress" : "completed";
}

export function createMockLesson(payload: LessonCreatePayload, student: StudentRef, teacher: TeacherRef, startsAt = payload.starts_at, id = `mock-${crypto.randomUUID()}`): LessonReadDTO {
  const lesson: LessonReadDTO = { id, title: payload.title, description: payload.description ?? null, starts_at: startsAt, duration_minutes: payload.duration_minutes, student, teacher, status: "planned", attendance: "not_set" };
  saveMockState(id, lesson); return lesson;
}
