# Frontend: routes и pages

## Маршруты

| Route | Role | Page/component | Назначение |
|---|---|---|---|
| `/` | public/auth | `HomePage` | После bootstrap redirect на login или dashboard |
| `/login` | public only | `LoginPage` | Login; authenticated redirect на dashboard |
| `/register` | public only | `RegisterPage` | Регистрация `TEACHER`/`STUDENT` |
| `/dashboard` | `TEACHER`, `STUDENT` | `DashboardPage` | Role-aware metrics и recent connections |
| `/profile` | `TEACHER`, `STUDENT` | `ProfilePage` | Просмотр/редактирование Profile |
| `/schedule` | `TEACHER`, `STUDENT` | `PlaceholderPage` | UI placeholder, backend отсутствует |
| `/homework` | `TEACHER`, `STUDENT` | `PlaceholderPage` | UI placeholder, backend отсутствует |
| `/students` | `TEACHER` | `StudentsPage` | Список/search учеников, invitation dialog |
| `/students/:id` | `TEACHER` | `StudentDetailPage` | Контакты и private note |
| `/teachers` | `STUDENT` | `TeachersPage` | Список/search и accept invitation |
| `/teachers/:id` | `STUDENT` | `TeacherDetailPage` | Контакты connected teacher |
| nested `*` | signed-in workspace | `NotFoundPage` | 404 внутри `AppShell` |

## Страницы и backend

### `LoginPage`

Public-only. Поля email/password, Zod validation, submit state, registration-success alert и safe server error. Вызывает `POST /api/v1/auth/login`, затем `GET /api/v1/auth/me`; success → `/dashboard`.

### `RegisterPage`

Public-only. Имя, фамилия, optional отчество, email, role, timezone, password. Role только teacher/student; client password policy совпадает с backend. `POST /api/v1/auth/register`; success → login с alert. Loading и error встроены в form.

### `DashboardPage`

`GET /api/v1/dashboard/summary`. Общие loading/error/retry. Для teacher: 3 metrics, recent students, empty state и `InvitationDialog`. Для student: teacher count, recent teachers, empty state и `AcceptInvitationDialog`; card «Учебный ритм» — placeholder.

### `ProfilePage`

`GET/PATCH /api/v1/profile`. Main tab редактирует names, bio, timezone; email/role read-only. Success/error/loading/retry. Tabs «Безопасность» и «Уведомления» — placeholders без API.

### `StudentsPage` / `StudentDetailPage`

Teacher-only. Список использует `GET /students`, client-side search, loading/error/empty и invitation dialog. Detail использует `GET /students/{id}`; note — `PATCH /students/{id}/note` с pending/success/error, затем обновляет detail cache и invalidates list. Tabs schedule/homework — placeholders.

### `TeachersPage` / `TeacherDetailPage`

Student-only. Список использует `GET /teachers`, search, loading/error/empty/success-after-accept и accept dialog. Detail использует `GET /teachers/{id}`. Tabs schedule/homework — placeholders.

### Служебные pages

- `ForbiddenPage` показывается `RoleGate`, когда роль не входит в allowed.
- `NotFoundPage` обрабатывает неизвестный nested workspace route.
- `HomePage` ждёт bootstrap и redirect-ит.
- `PlaceholderPage` не вызывает API и явно сообщает об отсутствии feature.

## Различия ролей

- `TEACHER`: dashboard students/invitations, `/students`, private notes, создание/list/revoke invitation.
- `STUDENT`: dashboard teachers, `/teachers`, принятие one-time code; private teacher note никогда не показывается.
- `ADMIN`: не допускается в application workspace (`RoleGate` разрешает только teacher/student). Администрирование выполняется отдельно через backend `/admin`; frontend admin page не реализована.

Frontend guards улучшают UX. Авторизация каждого endpoint повторно и независимо проверяется backend.
