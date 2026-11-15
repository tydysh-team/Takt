# Frontend: API и TypeScript types

Источник контрактов — `frontend/src/api/types.ts`; вызовы — `frontend/src/api/queries.ts` и `AuthProvider.tsx`.

| Type/interface | Использование | Backend DTO / endpoint |
|---|---|---|
| `RoleCode` | Роль session/profile | `RoleCode`: `ADMIN|TEACHER|STUDENT` |
| `ApplicationRole` | Доступные frontend workspace/registration роли | `TEACHER|STUDENT` |
| `AccessTokenResponse` | Login/refresh | одноимённый DTO; `/auth/login`, `/auth/refresh` |
| `CurrentUser` | AuthContext | `CurrentUserResponse`; `/me` |
| `RegisterPayload`, `RegisterResponse` | Registration | `RegisterRequest/Response` |
| `LoginPayload` | Login body | `LoginRequest` |
| `Profile`, `ProfileUpdate` | Profile query/form | `ProfileResponse`, `ProfileUpdateRequest` |
| `StudentListItem`, `StudentDetail` | Teacher pages | backend `StudentListItem`, `StudentDetailResponse` |
| `TeacherListItem` | Student pages | backend `TeacherListItem` |
| `InvitationCreateResponse`, `InvitationListItem` | Invitation dialog | одноимённые backend DTO |
| `ConnectionAcceptedResponse` | Accept dialog | одноимённый backend DTO |
| `TeacherDashboard`, `StudentDashboard`, `DashboardSummary` | Dashboard discriminated union | dashboard response DTOs |
| `ApiErrorDetail`, `ApiErrorEnvelope` | Canonical error parsing | `ErrorDetail`, `ErrorResponse` |

Всего в `api/types.ts` экспортируется 17 interfaces и 3 type aliases.

## Основные поля

```ts
type RoleCode = "TEACHER" | "STUDENT" | "ADMIN";

interface CurrentUser {
  id: string;
  email: string;
  role: RoleCode;
  first_name: string;
  last_name: string;
  middle_name: string | null;
}

interface Profile {
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string;
  role: RoleCode;
  bio: string | null;
  timezone: string;
}
```

`StudentListItem`: identity/contact, `timezone`, `connected_at`, `status`. `StudentDetail` заменяет flat status на `connection { status, connected_at, teacher_note }`. `TeacherListItem` не содержит `teacher_note` или status.

`InvitationCreateResponse` единственный frontend type с raw `code`; list item содержит timestamps и derived `status`, но не code/digest.

```ts
type DashboardSummary = TeacherDashboard | StudentDashboard;
// discriminator: data.role === "TEACHER" | "STUDENT"
```

DB-only поля (`password_hash`, `code_digest`, refresh sessions, `family_id`, internal FK) в frontend contracts отсутствуют.

`RegisterPayload` не содержит `timezone`; при регистрации backend сам устанавливает Profile timezone `Europe/Moscow`. Поле timezone остаётся в `Profile` и `ProfileUpdate`.

## Endpoint mapping

| Frontend function | Endpoint | Result |
|---|---|---|
| `api.dashboard()` | `GET /api/v1/dashboard/summary` | `DashboardSummary` |
| `api.students()` / `api.student(id)` | `GET /students[/{id}]` | list/detail student |
| `api.updateStudentNote(id,note)` | `PATCH /students/{id}/note` | `StudentDetail` |
| `api.teachers()` / `api.teacher(id)` | `GET /teachers[/{id}]` | list/detail teacher |
| `api.invitations()` | `GET /invitations` | `InvitationListItem[]` |
| `api.createInvitation()` | `POST /invitations` | `InvitationCreateResponse` |
| `api.revokeInvitation(id)` | `POST /invitations/{id}/revoke` | `undefined` (`204`) |
| `api.acceptInvitation(code)` | `POST /connections/accept` | `ConnectionAcceptedResponse` |
| `api.profile()` / `api.updateProfile()` | `GET/PATCH /profile` | `Profile` |
| `api.searchLessons(filters)` | `POST /lessons/search` | `LessonReadDTO[]` |
| `api.createLesson()` / `api.createLessonSeries()` | `POST /lessons`, `POST /lessons/series` | `LessonDTO`, `LessonDTO[]` |
| `api.rescheduleLesson()` / `api.cancelLesson()` / `api.updateLessonAttendance()` | `PATCH /lessons/{id}/schedule`, `POST /lessons/{id}/cancel`, `PUT /lessons/{id}/attendance` | `LessonReadDTO` |
| `api.personSchedule(id, filters)` | `POST /lessons/people/{id}/schedule` | `PersonScheduleItem[]` (`lesson` / `busy`) |
| `api.teacherHomework()` / `api.studentHomework()` | `GET /homework`, `GET /students/me/homework` | `HomeworkPage` |
| `api.homeworkDetail(id, role)` | `GET /homework/{id}` / `GET /students/me/homework/{id}` | `Homework` |
| `api.createHomework()` / `api.submitHomework()` | `POST` с `FormData` + `Idempotency-Key` | `Homework`, `HomeworkSubmissionResult` |
| `api.pendingSubmissions()` / `api.pendingSubmission(id)` | `GET /teachers/me/homework/submissions/pending[/{id}]` | `PendingSubmissionPage`, `PendingSubmission` |
| `api.acceptSubmission()` / `api.returnSubmission()` | `POST .../review`, `POST .../revision` | `HomeworkSubmission` |
| `api.homeworkHistory()` | `GET .../submissions` | `HomeworkSubmission[]` |
| `api.download*Attachment()` | `GET .../attachments/{id}/download` | `Blob` |
| `api.myProgress(period)` | `GET /students/me/progress` | `ProgressResponse` |
| `api.studentProgress(id, period)` | `GET /teachers/me/students/{id}/progress` | `ProgressResponse` |
| `api.lessonHistory(id, period)` | `GET /teachers/me/students/{id}/lesson-history` | `LessonHistoryResponse` |
| `api.homeworkStatistics(id, period)` | `GET /teachers/me/students/{id}/homework-statistics` | `HomeworkStatisticsResponse` |

Пути приведены без общего префикса `/api/v1` — его добавляет `apiRequest`. Всеmutating запросы проходят с in-memory JWT; операции с файлами используют `FormData` и заголовок `Idempotency-Key`; скачивание возвращает `Blob`.

## Sprint 3 contracts

`Homework` / `HomeworkPage`: статусы `assigned | submitted | needs_revision | reviewed`, `is_overdue`, `created_at`, `attachments`, `latest_submission`. Оценка — целое 0–100; возврат на доработку требует комментария.

`LessonHistoryResponse`: `history[]` (`id, title, starts_at, ends_at, status, attendance`) и `aggregates` (`total/completed/attended/missed/unmarked/cancelled_lessons`, `attendance_rate: number | null`).

`HomeworkStatisticsDTO`: `assigned, submitted, reviewed, late, revision_required, completion_rate: number | null`.

`ProgressResponse`: `student_id, date_from, date_to, attendance, homework, reviews` (`graded_homework`, `average_grade: number | null`). Период — полуоткрытый `date_from <= t < date_to`, timezone-aware ISO 8601; `null` означает N/A, а не ноль. Скрытого score и `comparison` в контракте нет.

Auth requests собраны в `features/auth/auth-api.ts`; `AuthProvider` использует register, login, logout и `/api/v1/me`, а refresh остаётся в общем API client.
