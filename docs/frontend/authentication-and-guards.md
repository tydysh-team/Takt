# Frontend: authentication и guards

## Session flow

1. `AuthProvider` starts with `status="bootstrapping"`.
2. Один раз вызывает `refreshAccessToken()` с cookies, CSRF header и `credentials: "include"`.
3. При успехе access JWT сохраняется только в module memory, затем `/api/v1/me` загружает `CurrentUser`.
4. При failure очищаются token, user, TanStack Query cache; status становится `unauthenticated`.

Login вызывает `/auth/login`, сохраняет returned JWT в memory и загружает `/api/v1/me`. Registration session не создаёт. Logout вызывает CSRF-protected `/auth/logout`; в `finally` всегда очищает local session/cache.

Access token не пишется в `localStorage`, `sessionStorage`, IndexedDB или cookie. Refresh token недоступен JavaScript: backend выдаёт его как HttpOnly cookie. JavaScript читает только `takt_csrf`.

## API client refresh/retry

Каждый authenticated request добавляет `Authorization: Bearer`. На `401` client запускает refresh, если request это разрешает, и повторяет исходный запрос ровно один раз. Параллельные 401 разделяют один `refreshRequest` promise. Если refresh неуспешен, session-expired handler очищает session; refresh/login/me не входят в бесконечный retry loop.

Все fetch используют `credentials: "include"`. Network/CORS failure становится safe `ApiError(code="network_error", status=0)`; canonical backend envelope сохраняет code/status/details.

## Guards

- `SessionGate publicOnly`: во время bootstrap показывает loading; authenticated user не остаётся на login/register.
- `SessionGate`: unauthenticated redirect на `/login` с `state.from` (текущий login после успеха всё равно ведёт на `/dashboard`).
- `RoleGate`: проверяет одну `user.role` через `canAccessRole`; denied → `ForbiddenPage`.
- Outer workspace gate разрешает только `TEACHER`/`STUDENT`; nested gates разделяют students/teachers routes.

Текущая single-role модель:

```text
user.role = ADMIN | TEACHER | STUDENT
```

`ApplicationRole` исключает `ADMIN` для public workspace/registration. Frontend guard — только UX. Настоящая security boundary — backend JWT validation, current DB role, active flag, ownership и role dependencies на каждом endpoint.
