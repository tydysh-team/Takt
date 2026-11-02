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
  StudentRef,
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
};

export const api = {
  dashboard: () => apiRequest<DashboardSummary>("/dashboard/summary"),
  students: () => apiRequest<StudentListItem[]>("/students"),
  teacherStudents: () => apiRequest<StudentRef[]>("/teachers/me/students"),
  searchLessons: (filters: LessonSearchFilters = {}) =>
    apiRequest<LessonReadDTO[]>("/lessons/search", { method: "POST", body: filters }),
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
