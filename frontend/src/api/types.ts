export type RoleCode = "TEACHER" | "STUDENT" | "ADMIN";
export type ApplicationRole = Exclude<RoleCode, "ADMIN">;

export interface HomeworkAttachment {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
}

export interface Homework {
  id: string;
  teacher_id: string;
  teacher_name: string;
  student_id: string;
  student_name: string;
  title: string;
  description: string | null;
  due_at: string;
  status: string;
  is_overdue: boolean;
  created_at: string;
  attachments: HomeworkAttachment[];
  latest_submission?: HomeworkSubmission | null;
}

export interface HomeworkSubmission {
  id: string;
  homework_id: string;
  attempt_no: number;
  comment: string | null;
  submitted_at: string;
  is_late: boolean;
  attachments: HomeworkAttachment[];
}

export interface HomeworkSubmissionResult {
  submission: HomeworkSubmission;
  homework: Homework;
}

export interface PendingSubmission extends HomeworkSubmission {
  student_id: string;
  student_name: string;
  title: string;
  due_at: string;
  homework_status: string;
}

export interface PendingSubmissionPage {
  items: PendingSubmission[];
  total: number;
  limit: number;
  offset: number;
}

export interface HomeworkPage {
  items: Homework[];
  total: number;
  limit: number;
  offset: number;
}

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
    context?: Record<string, unknown> | null;
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
  bio: string | null;
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
  confirm_conflict?: boolean;
}

export interface LessonFormPayload extends Omit<LessonCreatePayload, "confirm_conflict"> {
  recurrence?: { frequency: "weekly"; count: number };
}

export interface LessonSeriesPayload {
  student_id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  duration_minutes: number;
  recurrence: "weekly";
  count: number;
  confirm_conflict?: boolean;
}

export type LessonStatus = "planned" | "in_progress" | "completed" | "cancelled";
export type LessonAttendance = "not_set" | "present" | "absent";

export interface LessonDTO {
  id: string;
  teacher_id: string;
  student_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: LessonStatus;
  is_rescheduled: boolean;
  attendance: LessonAttendance;
  cancellation_reason: string | null;
}

export interface LessonConflict {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  student: StudentRef;
}

export interface LessonSeriesConflictExisting {
  type: "existing_lesson";
  series_index: number;
  series_number: number;
  series_starts_at: string;
  series_ends_at: string;
  lesson: LessonConflict;
}

export interface LessonSeriesConflictInternal {
  type: "within_series";
  series_index: number;
  series_number: number;
  series_starts_at: string;
  series_ends_at: string;
  other_series_index: number;
  other_series_number: number;
  other_series_starts_at: string;
  other_series_ends_at: string;
}

export type LessonSeriesConflict = LessonSeriesConflictExisting | LessonSeriesConflictInternal;

export interface LessonSearchFilters {
  date_from?: string | null;
  date_to?: string | null;
}

export interface LessonReadDTO {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: LessonStatus;
  is_rescheduled: boolean;
  attendance: LessonAttendance;
  cancellation_reason: string | null;
  teacher: TeacherRef;
  student: StudentRef;
}

export type PersonScheduleItem = (LessonReadDTO & { type: "lesson" }) | {
  type: "busy";
  starts_at: string;
  ends_at: string;
};

export type LessonLifecycleStatus = LessonStatus;



