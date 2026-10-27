export type RoleCode = "TEACHER" | "STUDENT" | "ADMIN";
export type ApplicationRole = Exclude<RoleCode, "ADMIN">;

export interface ApiErrorDetail {
  location: (string | number)[];
  code: string;
  message: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: RoleCode;
  first_name: string;
  last_name: string;
  middle_name: string | null;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  role: ApplicationRole;
  timezone: string;
}

export interface RegisterResponse extends Omit<CurrentUser, "role"> {
  role: ApplicationRole;
  created_at: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface Profile {
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string;
  role: RoleCode;
  bio: string | null;
  timezone: string;
}

export interface ProfileUpdate {
  first_name?: string;
  last_name?: string;
  middle_name?: string | null;
  bio?: string | null;
  timezone?: string;
}

export interface StudentListItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  timezone: string;
  connected_at: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface StudentDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  timezone: string;
  connection: {
    status: "ACTIVE" | "INACTIVE";
    connected_at: string;
    teacher_note: string | null;
  };
}

export interface TeacherListItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  timezone: string;
  connected_at: string;
}

export interface InvitationCreateResponse {
  id: string;
  code: string;
  created_at: string;
  expires_at: string;
}

export interface InvitationListItem {
  id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  status: "ACTIVE" | "USED" | "REVOKED" | "EXPIRED";
}

export interface ConnectionAcceptedResponse {
  teacher: TeacherListItem;
}

export interface TeacherDashboard {
  role: "TEACHER";
  students_count: number;
  new_students_30d: number;
  active_invitations_count: number;
  recent_students: StudentListItem[];
}

export interface StudentDashboard {
  role: "STUDENT";
  teachers_count: number;
  recent_teachers: TeacherListItem[];
}

export type DashboardSummary = TeacherDashboard | StudentDashboard;


export interface PersonRef {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
}

export type StudentRef = PersonRef;
export type TeacherRef = PersonRef;

export interface LessonCreatePayload {
  student_id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  duration_minutes: number;
  recurrence?: { frequency: "weekly"; count: number };
}

export interface LessonDTO {
  id: string;
  teacher_id: string;
  student_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
}

export interface LessonSearchFilters {
  date_from?: string | null;
  date_to?: string | null;
}

export interface LessonReadDTO {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
  teacher: TeacherRef;
  student: StudentRef;
  status?: "planned" | "in_progress" | "completed" | "cancelled";
  attendance?: "not_set" | "present" | "absent";
  rescheduled?: boolean;
}

export type LessonLifecycleStatus = NonNullable<LessonReadDTO["status"]>;
export type LessonAttendance = NonNullable<LessonReadDTO["attendance"]>;



