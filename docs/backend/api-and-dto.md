# Backend: API и DTO

Базовый versioned prefix — `/api/v1`. Исключения: `/health`, документация `/api/docs`, `/api/redoc`, `/api/openapi.json` и SQLAdmin `/admin`.

## Сводка endpoints

| Method | Endpoint | Access | Request DTO | Response DTO | Назначение |
|---|---|---|---|---|---|
| GET | `/health` | public | — | `HealthResponse` | Process health |
| POST | `/api/v1/auth/register` | public, rate limited | `RegisterRequest` | `RegisterResponse` | Регистрация teacher/student |
| POST | `/api/v1/auth/login` | public, rate limited | `LoginRequest` | `AccessTokenResponse` | Login и cookies |
| POST | `/api/v1/auth/refresh` | refresh cookie + CSRF | — | `AccessTokenResponse` | Rotation |
| POST | `/api/v1/auth/logout` | refresh cookie + CSRF | — | — (`204`) | Отзыв session |
| GET | `/api/v1/me` | active user | — | `CurrentUserResponse` | Текущий пользователь |
| GET | `/api/v1/profile` | active user | — | `ProfileResponse` | Профиль |
| PATCH | `/api/v1/profile` | active user | `ProfileUpdateRequest` | `ProfileResponse` | Частичное обновление |
| POST | `/api/v1/invitations` | `TEACHER` | — | `InvitationCreateResponse` | Создать приглашение |
| GET | `/api/v1/invitations` | `TEACHER` | — | `list[InvitationListItem]` | История приглашений |
| POST | `/api/v1/invitations/{invitation_id}/revoke` | `TEACHER` | path UUID | — (`204`) | Отозвать приглашение |
| POST | `/api/v1/connections/accept` | `STUDENT`, rate limited | `InvitationAcceptRequest` | `ConnectionAcceptedResponse` | Принять код |
| GET | `/api/v1/students` | `TEACHER` | — | `list[StudentListItem]` | Активные ученики |
| GET | `/api/v1/students/{student_id}` | `TEACHER` | path UUID | `StudentDetailResponse` | Детали своего ученика |
| PATCH | `/api/v1/students/{student_id}/note` | `TEACHER` | `TeacherNoteUpdateRequest` | `StudentDetailResponse` | Приватная заметка |
| GET | `/api/v1/teachers` | `STUDENT` | — | `list[TeacherListItem]` | Активные преподаватели |
| GET | `/api/v1/teachers/{teacher_id}` | `STUDENT` | path UUID | `TeacherListItem` | Детали своего преподавателя |
| GET | `/api/v1/dashboard/summary` | `TEACHER`/`STUDENT` | — | `TeacherDashboardResponse` или `StudentDashboardResponse` | Role-aware сводка |

Всего: 18 HTTP endpoints, включая `/health`. Query parameters в текущих routers отсутствуют.

## Подробности endpoints

### Health

- `GET /health` → `200 HealthResponse`; не обращается к domain state/БД.

### Register и Login

- `POST /api/v1/auth/register` → `201 RegisterResponse`. `RegisterRequest`; публично допустимы только `TEACHER`/`STUDENT`. Ошибки: `409 email_already_registered`, `422 validation_error`, `429 rate_limit_exceeded`.
- `POST /api/v1/auth/login` → `200 AccessTokenResponse`; устанавливает refresh HttpOnly cookie и readable CSRF cookie. Ошибки: `401 invalid_credentials`, `422 validation_error`, `429 rate_limit_exceeded`.
- `POST /api/v1/auth/refresh` → `200 AccessTokenResponse`; body/path/query отсутствуют, нужны refresh cookie и совпадающий `X-CSRF-Token`. Ошибки: `401 authentication_required` (включая replay/expired/inactive/missing session; cookies очищаются), `403 csrf_failed`.
- `POST /api/v1/auth/logout` → `204`; требует CSRF даже если refresh cookie отсутствует. При наличии session она отзывается, затем обе cookies очищаются. Ошибка: `403 csrf_failed`.
- `GET /api/v1/me` → `200 CurrentUserResponse`; Bearer JWT и active User. Ошибки: `401 authentication_required`, `403 forbidden` для inactive, `404 profile_not_found`.

### Profile

- `GET /api/v1/profile` → `200 ProfileResponse`; любая активная роль. Ошибки: `401 authentication_required`, `403 forbidden`, `404 profile_not_found`.
- `PATCH /api/v1/profile` → `200 ProfileResponse`; `ProfileUpdateRequest`, все поля optional, но явно переданные `first_name`, `last_name`, `timezone` не могут быть `null`. Email и role запрещены как extra fields. Ошибки предыдущего endpoint плюс `422 validation_error`.

### Invitations и Connections

- `POST /api/v1/invitations` → `201 InvitationCreateResponse`; только `TEACHER`. Raw code возвращается только здесь. Ошибки: `401 authentication_required`, `403 forbidden`.
- `GET /api/v1/invitations` → `200 list[InvitationListItem]`; только свои invitations, без code/digest. Ошибки: `401`, `403`.
- `POST /api/v1/invitations/{invitation_id}/revoke` → `204`; path `invitation_id: UUID`. Повторный revoke уже отозванного invitation идемпотентен. Ошибки: `401`, `403`, `404 invitation_not_found`, `409 invitation_not_active`, `422 validation_error` для path.
- `POST /api/v1/connections/accept` → `200 ConnectionAcceptedResponse`; `InvitationAcceptRequest`, только `STUDENT`. Атомарно использует invitation и создаёт/реактивирует relation. Ошибки: `400 invitation_invalid`, `401`, `403`, `409 already_connected`, `422 validation_error`, `429 rate_limit_exceeded`.

### Students, Teachers, Dashboard

- `GET /api/v1/students` → `200 list[StudentListItem]`; `TEACHER`, только active relations и active users. Ошибки `401`, `403`.
- `GET /api/v1/students/{student_id}` → `200 StudentDetailResponse`; UUID, только ученик с active relation данного teacher. Ошибки `401`, `403`, `404 connection_not_found`, `422`.
- `PATCH /api/v1/students/{student_id}/note` → `200 StudentDetailResponse`; `TeacherNoteUpdateRequest`, note ≤ 2000, blank нормализуется в `null`. Те же ошибки плюс body validation.
- `GET /api/v1/teachers` → `200 list[TeacherListItem]`; `STUDENT`, только active relations и active users. Ошибки `401`, `403`.
- `GET /api/v1/teachers/{teacher_id}` → `200 TeacherListItem`; UUID, только connected teacher. Ошибки `401`, `403`, `404 connection_not_found`, `422`.
- `GET /api/v1/dashboard/summary` → `200 TeacherDashboardResponse | StudentDashboardResponse`. `ADMIN` получает `403 forbidden`; ошибки также `401` и `403` для inactive.

## DTO

Все DTO используют `extra="forbid"`: неизвестные body fields дают `422 validation_error`.

### Auth DTO

| DTO | Поля (тип; required; validation/назначение) |
|---|---|
| `RegisterRequest` | `email: EmailStr` yes, trim/lower; `password: SecretStr` yes, 8..128 символов без complexity rules; `first_name`, `last_name: str` yes, trim, 1..100; `middle_name: str|null` no, max 100, blank→null; `role: Literal[TEACHER,STUDENT]` yes. `timezone` не принимается |
| `RegisterResponse` | `id: UUID`, `email: EmailStr`, `role: RoleCode`, `first_name`, `last_name: str`, `middle_name: str|null`, `created_at: datetime`; все required |
| `LoginRequest` | `email: EmailStr` yes, trim/lower; `password: SecretStr` yes |
| `AccessTokenResponse` | `access_token: str` yes; `token_type: Literal["bearer"]` default; `expires_in: int` seconds |
| `CurrentUserResponse` | `id: UUID`, `email: EmailStr`, `role: RoleCode`, `first_name`, `last_name: str`, `middle_name: str|null`; все required |

### Profile DTO

| DTO | Поля |
|---|---|
| `ProfileResponse` | required: `first_name`, `last_name`, `middle_name`, `email`, `role`, `bio`, `timezone` |
| `ProfileUpdateRequest` | все optional: `first_name`, `last_name` 1..100, trim; `middle_name` max 100, blank→null; `bio` max 2000, trim; `timezone` valid IANA, max 64 |

### Invitation/Connection DTO

| DTO | Поля |
|---|---|
| `InvitationCreateResponse` | `id: UUID`, `code: str`, `created_at`, `expires_at: datetime` |
| `InvitationListItem` | `id`, timestamps `created_at`, `expires_at`, nullable `used_at`, `revoked_at`, `status: ACTIVE|USED|REVOKED|EXPIRED` |
| `InvitationAcceptRequest` | `code: str`, required, trim, 1..64 |
| `StudentListItem` | `id`, `first_name`, `last_name`, `email`, `timezone`, `connected_at`, `status: RelationStatus` |
| `StudentConnection` | `status`, `connected_at`, `teacher_note: str|null` |
| `StudentDetailResponse` | identity/contact fields + `connection: StudentConnection` |
| `TeacherNoteUpdateRequest` | `note: str|null`, optional, max 2000, trim/blank→null |
| `TeacherListItem` | `id`, `first_name`, `last_name`, `email`, `timezone`, `connected_at` |
| `ConnectionAcceptedResponse` | `teacher: TeacherListItem` |

### Dashboard, health и error DTO

| DTO | Поля |
|---|---|
| `TeacherDashboardResponse` | `role: Literal[TEACHER]`, `students_count`, `new_students_30d`, `active_invitations_count: int`, `recent_students: list[StudentListItem]` |
| `StudentDashboardResponse` | `role: Literal[STUDENT]`, `teachers_count: int`, `recent_teachers: list[TeacherListItem]` |
| `HealthResponse` | `status: Literal["ok"]` |
| `ErrorDetail` | `location: list[str|int]`, `code: str`, `message: str` |
| `ErrorBody` | `code`, `message: str`, `details: list[ErrorDetail]` default `[]` |
| `ErrorResponse` | `error: ErrorBody` |

Всего описано 22 Pydantic DTO-класса.

## Canonical error format

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [
      { "location": ["body", "email"], "code": "invalid_value", "message": "..." }
    ]
  }
}
```

`details` сериализуется как массив, обычно пустой; validation errors содержат field details. Backend не возвращает stack traces или exception text клиенту.

## Реальные error codes

| `error.code` | HTTP | Причина |
|---|---:|---|
| `email_already_registered` | 409 | Нормализованный email уже есть |
| `invalid_credentials` | 401 | Неверный email/password либо inactive при login |
| `authentication_required` | 401 | Нет/невалиден JWT или refresh; refresh replay также использует этот public code |
| `forbidden` | 403 | Неверная роль, inactive access или dashboard для ADMIN |
| `csrf_failed` | 403 | Нет/не совпал CSRF cookie/header |
| `profile_not_found` | 404 | Profile отсутствует |
| `invitation_invalid` | 400 | Формат/состояние/teacher приглашения невалидны |
| `invitation_not_found` | 404 | Teacher не владеет invitation/ID нет |
| `invitation_not_active` | 409 | Used или expired invitation нельзя отозвать |
| `already_connected` | 409 | Уже есть active relation |
| `connection_not_found` | 404 | Нет доступной active relation |
| `rate_limit_exceeded` | 429 | In-memory IP bucket исчерпан; есть `Retry-After` |
| `validation_error` | 422 | Pydantic/path/JSON validation; detail codes: `required`, `unexpected_field`, `invalid_json`, `invalid_uuid`, `invalid_datetime`, `invalid_type`, `invalid_value` |
| `not_found` | 404 | Неизвестный route/resource FastAPI |
| `method_not_allowed` | 405 | Метод не поддержан |
| `http_error` | зависит | Прочая Starlette HTTP error |
| `internal_error` | 500 | Необработанная ошибка; наружу только безопасное сообщение |

`domain_error` определён как базовый code класса `DomainError`, но напрямую текущими сценариями не создаётся.
