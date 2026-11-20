# Frontend: архитектура

Frontend расположен в `frontend/src`, собирается Vite и использует React 19 + TypeScript.

| Каталог/файл | Ответственность |
|---|---|
| `pages/` | Route-level pages, queries/mutations и композиция UI |
| `components/` | Общие shells, header, person card |
| `components/ui/` | `Avatar`, `Button`, `Card`, `Dialog`, feedback и form controls |
| `features/auth/` | `AuthProvider`, context, role helpers, registration Zod schema, MFA-flow |
| `features/invitations/` | Teacher invitation dialog |
| `features/connections/` | Student accept dialog и formatter кода |
| `features/profile/` | Profile Zod schema |
| `features/lessons/` | Расписание: группировка стеков, статусы, тона предметов, конфликты, действия |
| `features/homework/` | `HomeworkPanel`, Zod-схемы форм, очередь проверки, экран истории задания |
| `features/progress/` | Панели US-18…21, период, форматирование метрик, хуки и блоки отчёта |
| `components/ThemeToggle.tsx` | Переключатель светлой/тёмной темы |
| `api/client.ts` | fetch wrapper, in-memory JWT, refresh/retry, FormData/blob, error normalization |
| `api/queries.ts` | Typed endpoint functions и TanStack query keys (включая 4 progress-эндпоинта) |
| `api/types.ts` | Frontend API contracts (Homework*, LessonHistory*, Progress*) |
| `routes/` | Browser router, session/role guards |
| `shared/` | Styles, тема (`theme.ts`), formatting, timezones, environment URL resolution |
| `main.tsx` | `QueryClientProvider` → `AuthProvider` → `RouterProvider` |

## State и data flow

- Server state хранит TanStack Query: dashboard, profile, invitations, students/teachers и details, расписание, домашние задания и прогресс. Default `staleTime` — 30 секунд, refetch on window focus выключен, retry — не для client errors и максимум один раз для server/network failures.
- Query keys включают роль, идентификатор выбранного человека и период (`date_from`/`date_to`), поэтому смена недели/периода/контекста пересчитывает данные без ручной инвалидации.
- Session state (`status`, `user`) хранит `AuthProvider`; access token — module variable в `api/client.ts`.
- Forms используют React Hook Form + Zod на login/register/profile и формах ДЗ/проверки; часть локальных состояний (выделенная строка, период, открытые диалоги) — controlled `useState`.
- Router использует nested `SessionGate`, `RoleGate` и `AppShell`. Страницы деталей человека встраивают `SchedulePage` / `HomeworkPanel` / панели прогресса с пропом контекста.
- API errors преобразуются в `ApiError`, затем `readableError()` даёт безопасное русское сообщение. Ошибка загрузки никогда не отображается как пустое состояние или нулевые метрики.
- Тема оформления — `data-theme` на `<html>`, значение в `localStorage`, CSS-токены в `:root` и `[data-theme="dark"]`; визуальные состояния (hover, выделение, disabled) также выражены токенами.

`VITE_API_BASE_URL` читается из root `.env`. В development helper подменяет loopback hostname API на hostname открытого frontend, чтобы cookies оставались same-site между `localhost` и `127.0.0.1`.
