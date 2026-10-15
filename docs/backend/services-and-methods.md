# Backend: сервисы и основные методы

Service layer владеет изменяющими транзакциями. Repository выполняет DB access, `flush`/locks/queries, но не делает `commit()`.

## `AuthService`

Файл: `backend/app/services/auth.py`.

### `register(payload)`

| Вход | Тип | Назначение |
|---|---|---|
| `payload` | `RegisterRequest` | Данные teacher/student |

Выход: `RegistrationResult(user: User, profile: Profile)`. Создаёт `User`, общий `Profile` с backend default `Europe/Moscow` и ровно один `TeacherProfile`/`StudentProfile`; hash password; flush + commit. `RegisterRequest` не принимает timezone. Ошибки: `EmailAlreadyRegisteredError`, DB errors. При любой ошибке rollback. Регистрация не создаёт login session.

### `login(payload)`

Вход: `LoginRequest`; выход: `LoginResult(access_token, refresh_token, csrf_token)`. Читает User `FOR UPDATE`, делает dummy verify для неизвестного email, проверяет active, при необходимости rehash, добавляет `RefreshSession`, commit. Ошибка `InvalidCredentialsError`; rollback.

### `refresh(raw_refresh_token)`

Вход: raw opaque `str`; выход: новый `LoginResult`. Находит digest `FOR UPDATE`. Валидную старую запись отзывает и создаёт новую в том же `family_id`. При expired/inactive отзывает запись. Повторно предъявленный revoked token запускает `revoke_family`. Изменения commit до безопасного `AuthenticationRequiredError`.

### `logout(raw_refresh_token)`

Вход: `str | None`; выход: `None`. Если запись найдена и active, выставляет `revoked_at`/`last_used_at`, commit. Отсутствующий token — no-op; DB errors → rollback.

## Current user и role checks

Файл: `backend/app/api/dependencies/auth.py`.

- `get_current_user()` декодирует Bearer JWT, загружает User и сверяет claim `role` с текущим `User.role`.
- `get_current_active_user()` запрещает inactive.
- `require_role(user, role)` сравнивает единственную роль.
- `get_current_teacher()`, `get_current_student()`, `get_current_admin()` — typed role dependencies.
- `validate_csrf()` constant-time сравнивает readable cookie с `X-CSRF-Token`.
- `enforce_rate_limit()` применяет HMAC(IP)-bucket к register/login/accept.

## `ProfileService`

Файл: `backend/app/services/profiles.py`.

- `get_for_user(user) -> Profile`: использует preloaded `user.profile` либо repository; `ProfileNotFoundError`.
- `update_for_user(user, payload) -> Profile`: `FOR UPDATE`, применяет только `model_dump(exclude_unset=True)`, commit; not found/прочие ошибки → rollback.

## `InvitationService`

Файл: `backend/app/services/invitations.py`.

- `create(teacher) -> CreatedInvitation`: проверяет `TEACHER`/active, генерирует code + HMAC digest, expiry по `INVITATION_TTL_DAYS`, commit. Raw code существует только в результате.
- `list_for_teacher(teacher) -> list[ListedInvitation]`: read-only; вычисляет `ACTIVE`, `USED`, `REVOKED`, `EXPIRED` по timestamps.
- `revoke(teacher, invitation_id) -> None`: owned row `FOR UPDATE`; revoked повторно — success/no change; missing → `InvitationNotFoundError`; used/expired → `InvitationNotActiveError`; commit/rollback.
- `accept(student, raw_code) -> AcceptedConnection`: проверяет `STUDENT`, нормализует/digest code, lock invitation, валидирует teacher/profile, lock pair relation. Создаёт либо реактивирует relation, помечает invitation used, commit атомарно. Ошибки: `InvalidInvitationError`, `AlreadyConnectedError`, duplicate pair constraint.

## `ConnectionService`

Файл: `backend/app/services/connections.py`.

- `list_students(teacher) -> list[ConnectionRecord]` и `get_student(teacher, student_id)`: teacher-only, только active relation/user; detail иначе `ConnectionNotFoundError`.
- `update_teacher_note(teacher, student_id, note) -> ConnectionRecord`: lock relation, изменяет private note, commit; rollback при ошибке.
- `list_teachers(student)` и `get_teacher(student, teacher_id)`: student-only; private `teacher_note` не включается в student DTO.

## `DashboardService.summary(user)`

Файл: `backend/app/services/dashboard.py`. Для `TEACHER` возвращает counts active students, new students за 30 дней, active invitations и 5 recent students. Для `STUDENT` — teacher count и 5 recent teachers. Для `ADMIN` — `ForbiddenError`. Метод read-only.

## Repositories

| Repository | Методы → вход → выход/назначение |
|---|---|
| `UserRepository` | `get_by_email(email, for_update)` / `get_by_id(id, for_update)` → `User|null` с Profile; `add(User)` |
| `ProfileRepository` | `get_by_user_id(user_id, for_update)` → `Profile|null` с User |
| `RefreshSessionRepository` | `get_by_token_hash(hash, for_update)` → session с User; `add`; `revoke_family(family_id, at)` bulk update |
| `TeacherInvitationRepository` | `add`; list by teacher; owned/by-digest locked lookups; active count |
| `TeacherStudentRelationRepository` | `add`; pair lookup; teacher/student list/detail; active counts и recent ordering |

Ни один repository не вызывает `commit()`. Read-only service methods также не открывают отдельные транзакции вручную; request-scoped `AsyncSession` закрывается dependency.
