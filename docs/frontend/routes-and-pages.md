# Frontend: routes и pages

## Маршруты

| Route | Role | Page/component | Назначение |
|---|---|---|---|
| `/` | public/auth | `HomePage` | После bootstrap redirect на login или dashboard |
| `/login` | public only | `LoginPage` | Login; authenticated redirect на dashboard |
| `/register` | public only | `RegisterPage` | Регистрация `TEACHER`/`STUDENT` |
| `/dashboard` | `TEACHER`, `STUDENT` | `DashboardPage` | Role-aware metrics и recent connections |
| `/profile` | `TEACHER`, `STUDENT` | `ProfilePage` | Просмотр/редактирование Profile |
| `/schedule` | `TEACHER`, `STUDENT` | `SchedulePage` | Неделя/список занятий, создание, перенос, отмена, посещаемость, конфликт-флоу |
| `/homework` | `TEACHER`, `STUDENT` | `HomeworkPage` → `HomeworkPanel` | Назначение, сдача, очередь проверки, оценка, доработка, история попыток |
| `/progress` | `STUDENT` | `StudentProgressPage` | Собственный прогресс: посещаемость, ДЗ, оценки |
| `/students` | `TEACHER` | `StudentsPage` | Список/search учеников, invitation dialog |
| `/students/:id` | `TEACHER` | `StudentDetailPage` | Контакты, private note, вкладки расписания/истории/прогресса |
| `/teachers` | `STUDENT` | `TeachersPage` | Список/search и accept invitation |
| `/teachers/:id` | `STUDENT` | `TeacherDetailPage` | Контакты connected teacher, вкладка расписания |
| nested `*` | signed-in workspace | `NotFoundPage` | 404 внутри `AppShell` |

## Страницы и backend

### `LoginPage`

Public-only. Поля email/password, Zod validation, submit state, registration-success alert и safe server error. Вызывает `POST /api/v1/auth/login`, затем `GET /api/v1/me`; success → `/dashboard`.

### `RegisterPage`

Public-only. Имя, фамилия, optional отчество, email, role и password. Timezone в форме и request отсутствует; backend создаёт Profile с `Europe/Moscow`. Role только teacher/student; password — 8..128 символов без complexity rules. `POST /api/v1/auth/register`; success → login с alert. Loading и error встроены в form.

### `DashboardPage`

`GET /api/v1/dashboard/summary`. Общие loading/error/retry. Для teacher: 3 metrics, recent students, empty state и `InvitationDialog`. Для student: teacher count, recent teachers, empty state и `AcceptInvitationDialog`; card «Учебный ритм» — placeholder.

### `ProfilePage`

`GET/PATCH /api/v1/profile`. Main tab редактирует names, bio, timezone; email/role read-only. Success/error/loading/retry. Вкладка «Безопасность» содержит управление паролем и TOTP-2FA; side-блоки показывают подключённых людей и приглашения.

### `SchedulePage`

`POST /lessons/search` (+ create/series/reschedule/cancel/attendance/people-schedule). Два режима — «Неделя» и «Список», переключение недель, фильтр «Отменённые», динамическая сетка часов, карточки занятий и стеков пересечений, боковой дровер, модалка деталей. Для Teacher доступны создание, перенос, отмена и отметка посещаемости; для Student — только просмотр. Расписание связанного преподавателя/ученика показывает общие занятия с деталями и чужие интервалы как обезличенные блоки «Занят».

### `HomeworkPage` / `HomeworkPanel`

`HomeworkPanel` — единый компонент для `/homework` и для вкладки заданий в карточке Student/Teacher. Поиск, фильтр статуса, пагинация, сводная карточка и адаптивная таблица. Teacher: «Назначить ДЗ», очередь работ на проверку (`PendingQueue`), принятие/возврат на доработку с оценкой 0–100. Student: сдача работы и повторная отправка после доработки. Файлы — `FormData` + `Idempotency-Key`, скачивание blob-эндпоинтами. Отдельный экран задания показывает полное описание, материалы и все попытки свёрнутым списком. Статусы: `assigned / submitted / needs_revision / reviewed`; `overdue` — вычисляемый признак.

### `StudentProgressPage` и панели прогресса

`GET /students/me/progress` для Student; для Teacher — `lesson-history`, `homework-statistics`, `progress` по выбранному Student. Период `date_from/date_to` явно показан и изменяем, входит в query key. Три объяснимых блока: attendance, homework, reviews. `null` показывается как N/A, реальный 0 остаётся 0; loading/empty/error/success разделены. Скрытого интегрального score и динамики «+% к прошлому периоду» нет — backend их не возвращает.

### `StudentsPage` / `StudentDetailPage`

Teacher-only. Список использует `GET /students`, client-side search, loading/error/empty и invitation dialog. Detail использует `GET /students/{id}`; note — `PATCH /students/{id}/note` с pending/success/error, затем обновляет detail cache и invalidates list. Вкладки «Расписание», «История», «Прогресс» и «Домашние задания» используют `SchedulePage`, `StudentHistoryPanel`, `StudentProgressPanel` и `HomeworkPanel`.

### `TeachersPage` / `TeacherDetailPage`

Student-only. Список использует `GET /teachers`, search, loading/error/empty/success-after-accept и accept dialog. Detail использует `GET /teachers/{id}`; вкладка расписания встраивает `SchedulePage` с контекстом выбранного преподавателя.

### Тема оформления

`ThemeToggle` в верхней панели переключает светлую/тёмную тему (`data-theme` на `<html>`). Выбор сохраняется в `localStorage` (`takt-theme`), при первом запуске учитывается `prefers-color-scheme`; inline-скрипт в `index.html` применяет тему до загрузки приложения, исключая мигание. Все поверхности, hover-состояния и тексты построены на CSS-токенах; в тёмной теме задний фон использует геометрический узор из CSS-градиентов, верхняя панель — волновой акцент.

### Служебные pages

- `ForbiddenPage` показывается `RoleGate`, когда роль не входит в allowed.
- `NotFoundPage` обрабатывает неизвестный nested workspace route.
- `HomePage` ждёт bootstrap и redirect-ит.
- `PlaceholderPage` используется для раздела «Домашние задания» только как legacy-заглушка; основной сценарий ДЗ работает через `HomeworkPanel`.

## Различия ролей

- `TEACHER`: dashboard students/invitations, `/students`, private notes, создание/list/revoke invitation.
- `STUDENT`: dashboard teachers, `/teachers`, принятие one-time code; private teacher note никогда не показывается.
- `ADMIN`: не допускается в application workspace (`RoleGate` разрешает только teacher/student). Администрирование выполняется отдельно через backend `/admin`; frontend admin page не реализована.

Frontend guards улучшают UX. Авторизация каждого endpoint повторно и независимо проверяется backend.
