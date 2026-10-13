# Frontend: API и TypeScript types

Источник контрактов — `frontend/src/api/types.ts`; вызовы — `frontend/src/api/queries.ts` и `AuthProvider.tsx`.

| Type/interface | Использование | Backend DTO / endpoint |
|---|---|---|
| `RoleCode` | Роль session/profile | `RoleCode`: `ADMIN|TEACHER|STUDENT` |
| `ApplicationRole` | Доступные frontend workspace/registration роли | `TEACHER|STUDENT` |
| `AccessTokenResponse` | Login/refresh | одноимённый DTO; `/auth/login`, `/auth/refresh` |
| `CurrentUser` | AuthContext | `CurrentUserResponse`; `/auth/me` |
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

Auth functions вызываются напрямую из `AuthProvider`: register, login, refresh, logout, me.
