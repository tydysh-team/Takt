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
} from "./types";

export const queryKeys = {
  dashboard: ["dashboard"] as const,
  invitations: ["invitations"] as const,
  profile: ["profile"] as const,
  students: ["students"] as const,
  student: (id: string) => ["students", id] as const,
  teachers: ["teachers"] as const,
  teacher: (id: string) => ["teachers", id] as const,
};

export const api = {
  dashboard: () => apiRequest<DashboardSummary>("/api/v1/dashboard/summary"),
  students: () => apiRequest<StudentListItem[]>("/api/v1/students"),
  student: (id: string) => apiRequest<StudentDetail>(`/api/v1/students/${id}`),
  updateStudentNote: (id: string, note: string | null) =>
    apiRequest<StudentDetail>(`/api/v1/students/${id}/note`, {
      method: "PATCH",
      body: { note },
    }),
  teachers: () => apiRequest<TeacherListItem[]>("/api/v1/teachers"),
  teacher: (id: string) => apiRequest<TeacherListItem>(`/api/v1/teachers/${id}`),
  invitations: () => apiRequest<InvitationListItem[]>("/api/v1/invitations"),
  createInvitation: () =>
    apiRequest<InvitationCreateResponse>("/api/v1/invitations", { method: "POST" }),
  revokeInvitation: (id: string) =>
    apiRequest<undefined>(`/api/v1/invitations/${id}/revoke`, { method: "POST" }),
  acceptInvitation: (code: string) =>
    apiRequest<ConnectionAcceptedResponse>("/api/v1/connections/accept", {
      method: "POST",
      body: { code },
    }),
  profile: () => apiRequest<Profile>("/api/v1/profile"),
  updateProfile: (payload: ProfileUpdate) =>
    apiRequest<Profile>("/api/v1/profile", { method: "PATCH", body: payload }),
};
