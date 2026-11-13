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
  HomeworkSubmissionResult,
  HomeworkSubmission,
  PendingSubmission,
  PendingSubmissionPage,
} from "./types";

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
  homework: (role: string, personId: string | undefined, offset: number) => ["homework", role, personId ?? "all", offset] as const,
  homeworkDetail: (role: string, id: string) => ["homework", role, id] as const,
  pendingSubmissions: (offset: number) => ["homework", "pending", offset] as const,
  pendingSubmission: (id: string) => ["homework", "pending", id] as const,
  homeworkHistory: (role: string, id: string) => ["homework", "history", role, id] as const,
};

export const api = {
  teacherHomework: (studentId?: string, offset = 0) =>
    apiRequest<HomeworkPage>(`/homework?limit=20&offset=${offset.toString()}${studentId ? `&student_id=${encodeURIComponent(studentId)}` : ""}`),
  studentHomework: (teacherId?: string, offset = 0) =>
    apiRequest<HomeworkPage>(`/students/me/homework?limit=20&offset=${offset.toString()}${teacherId ? `&teacher_id=${encodeURIComponent(teacherId)}` : ""}`),
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
  pendingSubmissions: (offset = 0) =>
    apiRequest<PendingSubmissionPage>(`/teachers/me/homework/submissions/pending?limit=20&offset=${offset.toString()}`),
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
  updateLessonAttendance: (id: string, attendance: "present" | "absent") =>
    apiRequest<LessonReadDTO>(`/lessons/${id}/attendance`, {
      method: "PUT",
      body: { attendance },
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
};
