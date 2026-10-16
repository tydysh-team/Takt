# Frontend: архитектура

Frontend расположен в `frontend/src`, собирается Vite и использует React 19 + TypeScript.

| Каталог/файл | Ответственность |
|---|---|
| `pages/` | Route-level pages, queries/mutations и композиция UI |
| `components/` | Общие shells, header, person card |
| `components/ui/` | `Avatar`, `Button`, `Card`, `Dialog`, feedback и form controls |
| `features/auth/` | `AuthProvider`, context, role helpers, registration Zod schema |
| `features/invitations/` | Teacher invitation dialog |
| `features/connections/` | Student accept dialog и formatter кода |
| `features/profile/` | Profile Zod schema |
| `api/client.ts` | fetch wrapper, in-memory JWT, refresh/retry, error normalization |
| `api/queries.ts` | Typed endpoint functions и TanStack query keys |
| `api/types.ts` | Frontend API contracts |
| `routes/` | Browser router, session/role guards |
| `shared/` | Styles, formatting, timezones и environment URL resolution |
| `main.tsx` | `QueryClientProvider` → `AuthProvider` → `RouterProvider` |

## State и data flow

- Server state хранит TanStack Query: dashboard, profile, invitations, students/teachers и details. Default `staleTime` — 30 секунд, refetch on window focus выключен, retry — не для client errors и максимум один раз для server/network failures.
- Session state (`status`, `user`) хранит `AuthProvider`; access token — module variable в `api/client.ts`.
- Forms используют React Hook Form + Zod на login/register/profile; invitation accept и teacher note используют controlled local state.
- Router использует nested `SessionGate`, `RoleGate` и `AppShell`.
- API errors преобразуются в `ApiError`, затем `readableError()` даёт безопасное русское сообщение.

`VITE_API_BASE_URL` читается из root `.env`. В development helper подменяет loopback hostname API на hostname открытого frontend, чтобы cookies оставались same-site между `localhost` и `127.0.0.1`.
