import type { LessonCreatePayload, LessonReadDTO, StudentRef, TeacherRef } from "../../api/types";

export type MockLessonState = Pick<LessonReadDTO, "starts_at" | "status" | "attendance" | "rescheduled"> & { id: string; title?: string; duration_minutes?: number; student?: StudentRef; teacher?: TeacherRef; description?: string | null };
const STORAGE_KEY = "takt.mock.lessons.v1";

function read(): MockLessonState[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as MockLessonState[]; } catch { return []; }
}
function write(items: MockLessonState[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
export function getMockState(id: string) { return read().find((item) => item.id === id); }
export function saveMockState(id: string, patch: Partial<MockLessonState>) {
  const items = read(); const index = items.findIndex((item) => item.id === id);
  if (index === -1) items.push({ id, starts_at: patch.starts_at ?? new Date().toISOString(), ...patch });
  else items[index] = { ...items[index], ...patch };
  write(items);
}
export function overlayMockLessons(lessons: LessonReadDTO[]): LessonReadDTO[] {
  const stored = read(); const byId = new Map(stored.map((item) => [item.id, item]));
  return lessons.map((lesson) => ({ ...lesson, ...(byId.get(lesson.id) ?? {}) }))
    .concat(stored.filter((item) => !lessons.some((lesson) => lesson.id === item.id)) as LessonReadDTO[]);
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
