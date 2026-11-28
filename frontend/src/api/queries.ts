import { apiRequest } from "./client";
import type {
  ConnectionAcceptedResponse,
  DashboardSummary,
  InvitationCreateResponse,
  InvitationListItem,
  Profile,
  ProfileUpdate,
  StudentDetail,
  StudentListItem,
  TeacherListItem,
  LessonCreatePayload,
  LessonSeriesPayload,
  LessonDTO,
  LessonReadDTO,
  LessonSearchFilters,
  PersonScheduleItem,
  StudentRef,
  Homework,
  HomeworkPage,
  HomeworkFilters,
  HomeworkSubmissionResult,
  HomeworkSubmission,
  PendingSubmission,
  PendingSubmissionPage,
  ProgressPeriod,
  ProgressResponse,
  LessonHistoryResponse,
  HomeworkStatisticsResponse,
} from "./types";

function periodQuery(period: ProgressPeriod): string {
  return `date_from=${encodeURIComponent(period.date_from)}&date_to=${encodeURIComponent(period.date_to)}`;
}

export const HOMEWORK_PAGE_SIZES = [5, 10, 20] as const;
export type HomeworkPageSize = (typeof HOMEWORK_PAGE_SIZES)[number];
export const DEFAULT_HOMEWORK_PAGE_SIZE: HomeworkPageSize = 5;

export function isHomeworkPageSize(value: number): value is HomeworkPageSize {
  return (HOMEWORK_PAGE_SIZES as readonly number[]).includes(value);
}

function homeworkQuery(offset: number, limit: number, personKey: string, personId?: string, filters: HomeworkFilters = {}): string {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
  if (personId) params.set(personKey, personId);
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  return params.toString();
}

export const queryKeys = {
  dashboard: ["dashboard"] as const,
  invitations: ["invitations"] as const,
  profile: ["profile"] as const,
  students: ["students"] as const,
  student: (id: string) => ["students", id] as const,
  teachers: ["teachers"] as const,
  teacher: (id: string) => ["teachers", id] as const,
  teacherStudents: ["teachers", "me", "students"] as const,
  lessons: (dateFrom: string, dateTo: string) => ["lessons", dateFrom, dateTo] as const,
  nextLesson: ["lessons", "next"] as const,
  personSchedule: (role: string, id: string, dateFrom: string, dateTo: string) =>
    ["lessons", "person", role, id, dateFrom, dateTo] as const,
  homework: (
    role: string,
    personId: string | undefined,
    offset: number,
    filters: HomeworkFilters & { limit?: number } = {},
  ) =>
    [
      "homework", role, personId ?? "all", offset, filters.search ?? "", filters.status ?? "",
      filters.date_from ?? "", filters.date_to ?? "", filters.limit ?? DEFAULT_HOMEWORK_PAGE_SIZE,
    ] as const,
  homeworkDetail: (role: string, id: string) => ["homework", role, id] as const,
  pendingSubmissions: (offset: number, studentId?: string, limit: number = DEFAULT_HOMEWORK_PAGE_SIZE) =>
    ["homework", "pending", offset, studentId ?? "all", limit] as const,
  pendingSubmission: (id: string) => ["homework", "pending", id] as const,
  homeworkHistory: (role: string, id: string) => ["homework", "history", role, id] as const,
  progress: (role: "TEACHER" | "STUDENT", studentId: string | undefined, dateFrom: string, dateTo: string) =>
    ["progress", role, studentId ?? "me", dateFrom, dateTo] as const,
  lessonHistory: (studentId: string, dateFrom: string, dateTo: string) =>
    ["progress", "lesson-history", studentId, dateFrom, dateTo] as const,
  homeworkStatistics: (studentId: string, dateFrom: string, dateTo: string) =>
    ["progress", "homework-statistics", studentId, dateFrom, dateTo] as const,
};

export const api = {
  teacherHomework: (studentId?: string, offset = 0, filters: HomeworkFilters = {}, limit: number = DEFAULT_HOMEWORK_PAGE_SIZE) =>
    apiRequest<HomeworkPage>(`/homework?${homeworkQuery(offset, limit, "student_id", studentId, filters)}`),
  studentHomework: (teacherId?: string, offset = 0, filters: HomeworkFilters = {}, limit: number = DEFAULT_HOMEWORK_PAGE_SIZE) =>
    apiRequest<HomeworkPage>(`/students/me/homework?${homeworkQuery(offset, limit, "teacher_id", teacherId, filters)}`),
  homeworkDetail: (id: string, role: "TEACHER" | "STUDENT") =>
    apiRequest<Homework>(role === "TEACHER" ? `/homework/${id}` : `/students/me/homework/${id}`),
  createHomework: (data: FormData, idempotencyKey: string) =>
    apiRequest<Homework>("/homework", { method: "POST", body: data, headers: { "Idempotency-Key": idempotencyKey } }),
  downloadHomeworkAttachment: (homeworkId: string, attachmentId: string) =>
    apiRequest<Blob>(`/homework/${homeworkId}/attachments/${attachmentId}/download`, { responseType: "blob" }),
  submitHomework: (homeworkId: string, data: FormData, idempotencyKey: string) =>
    apiRequest<HomeworkSubmissionResult>(`/homework/${homeworkId}/submissions`, {
      method: "POST", body: data, headers: { "Idempotency-Key": idempotencyKey },
    }),
  pendingSubmissions: (offset = 0, studentId?: string, limit: number = DEFAULT_HOMEWORK_PAGE_SIZE) =>
    apiRequest<PendingSubmissionPage>(`/teachers/me/homework/submissions/pending?${homeworkQuery(offset, limit, "student_id", studentId)}`),
  pendingSubmission: (id: string) =>
    apiRequest<PendingSubmission>(`/teachers/me/homework/submissions/${id}`),
  acceptSubmission: (id: string, payload: { grade: number; comment: string }) =>
    apiRequest<HomeworkSubmission>(`/teachers/me/homework/submissions/${id}/review`, { method: "POST", body: payload }),
  returnSubmission: (id: string, payload: { comment: string }) =>
    apiRequest<HomeworkSubmission>(`/teachers/me/homework/submissions/${id}/revision`, { method: "POST", body: payload }),
  homeworkHistory: (id: string, role: "TEACHER" | "STUDENT") =>
    apiRequest<HomeworkSubmission[]>(role === "TEACHER"
      ? `/teachers/me/homework/${id}/submissions`
      : `/students/me/homework/${id}/submissions`),
  downloadStudentSubmissionAttachment: (homeworkId: string, submissionId: string, attachmentId: string) =>
    apiRequest<Blob>(`/students/me/homework/${homeworkId}/submissions/${submissionId}/attachments/${attachmentId}/download`, { responseType: "blob" }),
  downloadSubmissionAttachment: (submissionId: string, attachmentId: string) =>
    apiRequest<Blob>(`/teachers/me/homework/submissions/${submissionId}/attachments/${attachmentId}/download`, { responseType: "blob" }),
  dashboard: () => apiRequest<DashboardSummary>("/dashboard/summary"),
  students: () => apiRequest<StudentListItem[]>("/students"),
  teacherStudents: () => apiRequest<StudentRef[]>("/teachers/me/students"),
  searchLessons: (filters: LessonSearchFilters = {}) =>
    apiRequest<LessonReadDTO[]>("/lessons/search", { method: "POST", body: filters }),
  personSchedule: (id: string, filters: { date_from: string; date_to: string }) =>
    apiRequest<PersonScheduleItem[]>(`/lessons/people/${id}/schedule`, { method: "POST", body: filters }),
  createLesson: (payload: LessonCreatePayload) =>
    apiRequest<LessonDTO>("/lessons", { method: "POST", body: payload }),
  createLessonSeries: (payload: LessonSeriesPayload) =>
    apiRequest<LessonDTO[]>("/lessons/series", { method: "POST", body: payload }),
  rescheduleLesson: (id: string, starts_at: string, confirm_conflict = false) =>
    apiRequest<LessonReadDTO>(`/lessons/${id}/schedule`, {
      method: "PATCH",
      body: { starts_at, confirm_conflict },
    }),
  cancelLesson: (id: string, reason?: string | null) =>
    apiRequest<LessonReadDTO>(`/lessons/${id}/cancel`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),
  lesson: (id: string) => apiRequest<LessonReadDTO>(`/lessons/${id}`),
  updateLessonAttendance: (id: string, attendance: "present" | "absent" | "not_set", studentId?: string) =>
    apiRequest<LessonReadDTO>(`/lessons/${id}/attendance`, {
      method: "PUT",
      body: { attendance, ...(studentId ? { student_id: studentId } : {}) },
    }),
  student: (id: string) => apiRequest<StudentDetail>(`/students/${id}`),
  updateStudentNote: (id: string, note: string | null) =>
    apiRequest<StudentDetail>(`/students/${id}/note`, {
      method: "PATCH",
      body: { note },
    }),
  teachers: () => apiRequest<TeacherListItem[]>("/teachers"),
  teacher: (id: string) => apiRequest<TeacherListItem>(`/teachers/${id}`),
  invitations: () => apiRequest<InvitationListItem[]>("/invitations"),
  createInvitation: () =>
    apiRequest<InvitationCreateResponse>("/invitations", { method: "POST" }),
  revokeInvitation: (id: string) =>
    apiRequest<undefined>(`/invitations/${id}/revoke`, { method: "POST" }),
  acceptInvitation: (code: string) =>
    apiRequest<ConnectionAcceptedResponse>("/connections/accept", {
      method: "POST",
      body: { code },
    }),
  profile: () => apiRequest<Profile>("/profile"),
  updateProfile: (payload: ProfileUpdate) =>
    apiRequest<Profile>("/profile", { method: "PATCH", body: payload }),
  myProgress: (period: ProgressPeriod) =>
    apiRequest<ProgressResponse>(`/students/me/progress?${periodQuery(period)}`),
  studentProgress: (studentId: string, period: ProgressPeriod) =>
    apiRequest<ProgressResponse>(`/teachers/me/students/${encodeURIComponent(studentId)}/progress?${periodQuery(period)}`),
  lessonHistory: (studentId: string, period: ProgressPeriod) =>
    apiRequest<LessonHistoryResponse>(`/teachers/me/students/${encodeURIComponent(studentId)}/lesson-history?${periodQuery(period)}`),
  homeworkStatistics: (studentId: string, period: ProgressPeriod) =>
    apiRequest<HomeworkStatisticsResponse>(`/teachers/me/students/${encodeURIComponent(studentId)}/homework-statistics?${periodQuery(period)}`),
};
