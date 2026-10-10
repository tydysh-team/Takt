# Takt

Takt is a web platform for organizing the learning process of private teachers and
students. This repository is a monorepo containing the FastAPI backend, React frontend,
and local Docker infrastructure.

The Foundation implementation includes secure authentication, profiles, teacher-student
connections, one-time invitations, role-aware dashboards, responsive teacher/student
workspaces, and an administrator workspace. Lessons, schedules, homework, progress, and
other later-sprint learning modules are intentionally not implemented; their navigation
entries are UI-only placeholders.

## Repository layout

```text
backend/   FastAPI application, Alembic migrations, and backend tests
frontend/  React and TypeScript application, frontend tests, and Vite tooling
docs/      Project documentation (added through the documentation workflow)
compose.yaml
```

## Prerequisites

- Docker with Docker Compose
- Python 3.12 for running backend tooling outside Docker
- Node.js 24 and npm for running frontend tooling outside Docker

## Local environment

1. Copy `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD` and update `DATABASE_URL` with the same password.
3. Start the stack:

   ```shell
   docker compose up --build
   ```

Compose waits for PostgreSQL health before starting the Backend, applies Alembic migrations,
and then starts the Frontend after the Backend healthcheck succeeds. The local services are
available at:

- Frontend: http://localhost:5173
- Backend health: http://localhost:8000/health
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc
- OpenAPI JSON: http://localhost:8000/api/openapi.json
- SQLAdmin: http://localhost:8000/admin

Stop the stack with `docker compose down`. Add `--volumes` only when the local PostgreSQL
data can be discarded.

## Backend development

From `backend/`, create a Python 3.12 virtual environment and install development
dependencies:

```shell
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
```

On Linux or macOS, use `.venv/bin/python` instead. Run the quality gates with:

```shell
ruff check .
mypy app alembic tests
pytest
```

Alembic reads the same `DATABASE_URL` as the application:

```shell
alembic upgrade head
alembic current
```

Authentication and persistence tests require a separate PostgreSQL database. Set
`TEST_DATABASE_URL`, apply migrations to that database, and then run pytest. SQLite is not
supported as an application or test database. The Alembic history contains the baseline,
authentication/profile, and teacher-student connection migrations; `alembic upgrade head`
is the supported way to create or update a database.

## Authentication API

The Backend exposes registration, login, refresh rotation, logout, current-user, and profile
operations under `/api/v1`. Access tokens are short-lived JWTs returned in response bodies.
Refresh tokens are opaque, one-time values stored only as HMAC digests and delivered through
an HttpOnly cookie. Cookie-based refresh and logout require the CSRF cookie value in the
`X-CSRF-Token` header.

The browser application stores the access JWT only in module memory—never in localStorage,
sessionStorage, IndexedDB, or a persistent cookie. At startup it attempts a CSRF-protected
refresh using the HttpOnly refresh cookie, then loads `/api/v1/auth/me`. Concurrent
expired-token responses share one refresh operation and each eligible request is retried at
most once. Logout clears the in-memory token, current user, and private TanStack Query cache.

Production requires independent random values for `JWT_SECRET_KEY`,
`REFRESH_TOKEN_HMAC_KEY`, `RATE_LIMIT_HMAC_KEY`, `INVITATION_CODE_SECRET`, and
`ADMIN_SESSION_SECRET`; placeholder values are rejected.

## Connections and invitations

Teachers can create, list, and revoke one-time invitations through `/api/v1/invitations`.
Students accept a code through `/api/v1/connections/accept`. Codes are returned only when
created; PostgreSQL stores an HMAC digest. Connected teachers and students are available
through `/api/v1/teachers`, `/api/v1/students`, and `/api/v1/dashboard/summary`.

In the UI, a teacher creates and revokes invitations from the dashboard or Students page.
Only a newly-created code is displayed. A student enters that code from the dashboard or
Teachers page. Successful acceptance refreshes both the teacher list and dashboard. Private
teacher notes are exposed only through teacher-authorized Student endpoints and never appear
in Student-facing DTOs.

## Development seed and administration

After applying migrations, seed local development data explicitly:

```shell
docker compose exec backend python -m app.seed
```

The command refuses to run unless `APP_ENV=development` and is safe to run repeatedly. Demo
accounts use password `TaktDemo!2026`:

- `admin@demo.example.com`
- `teacher@demo.example.com`
- `student1@demo.example.com`
- `student2@demo.example.com`
- `student3@demo.example.com`

These are development credentials only and must never be used in production. SQLAdmin is
mounted at http://localhost:8000/admin; enter the ADMIN email in its username field.

## Frontend development

From `frontend/`:

```shell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

Vite reads `VITE_API_BASE_URL` from the repository-root `.env`. This is public browser
configuration and must never contain secrets. In local development, opening the Frontend
through either `localhost` or `127.0.0.1` also selects that hostname for API requests so
refresh cookies remain on the same site. The Backend accepts both loopback Frontend origins
in development when either one is configured in `CORS_ORIGINS`.

The application routes are:

- public: `/login`, `/register`;
- authenticated: `/dashboard`, `/profile`, `/schedule`, `/homework`;
- teacher-only: `/students`, `/students/:id`;
- student-only: `/teachers`, `/teachers/:id`.

Route guards improve navigation UX while Backend authorization remains authoritative. The
Frontend is organized by `pages`, `features`, `components`, `api`, `shared`, and `routes`.
TanStack Query owns server state; React Hook Form and Zod provide form state and client-side
validation.

## Configuration and security

- `.env` is local and ignored by Git; `.env.example` contains names and safe placeholders.
- Backend configuration is loaded centrally from environment variables and fails fast when
  required values are missing.
- CORS origins and trusted hosts are explicit lists.
- Local development permits browser Private Network Access preflights only for configured
  origins; this permission is always disabled when `APP_ENV=production`.
- No credentials are baked into Docker images.
- Operational health is exposed outside the versioned application API. Future application
  endpoints belong under `/api/v1`.
- Access tokens and invitation codes are not persisted by the Frontend. Refresh tokens are
  never readable from JavaScript.

## Foundation quality gates

Run these before submitting changes:

```shell
cd backend
ruff check .
mypy app alembic tests
pytest

cd ../frontend
npm run lint
npm run typecheck
npm test
npm run build

cd ..
docker compose config --quiet
```
