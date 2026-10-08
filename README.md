# Takt

Takt is a web platform for organizing the learning process of private teachers and
students. This repository is a monorepo containing the FastAPI backend, React frontend,
and local Docker infrastructure.

The current implementation includes the technical foundation plus the backend identity,
authentication, refresh-session, and profile modules. Learning-process, invitation,
dashboard, and other later-sprint domain functionality is not implemented yet.

## Repository layout

```text
backend/   FastAPI application, Alembic migrations, and backend tests
frontend/  React and TypeScript application
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

The local services are then available at:

- Frontend: http://localhost:5173
- Backend health: http://localhost:8000/health
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc
- OpenAPI JSON: http://localhost:8000/api/openapi.json

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

Authentication and profile persistence tests require a separate PostgreSQL database. Set
`TEST_DATABASE_URL`, apply migrations to that database, and then run pytest. SQLite is not
supported as an application or test database.

## Authentication API

The Backend exposes registration, login, refresh rotation, logout, current-user, and profile
operations under `/api/v1`. Access tokens are short-lived JWTs returned in response bodies.
Refresh tokens are opaque, one-time values stored only as HMAC digests and delivered through
an HttpOnly cookie. Cookie-based refresh and logout require the CSRF cookie value in the
`X-CSRF-Token` header.

Production requires independent random values for `JWT_SECRET_KEY`,
`REFRESH_TOKEN_HMAC_KEY`, and `RATE_LIMIT_HMAC_KEY`; placeholder values are rejected.

## Frontend development

From `frontend/`:

```shell
npm ci
npm run lint
npm run typecheck
npm run build
npm run dev
```

Vite reads `VITE_API_BASE_URL` from the repository-root `.env`. This is public browser
configuration and must never contain secrets.

## Configuration and security

- `.env` is local and ignored by Git; `.env.example` contains names and safe placeholders.
- Backend configuration is loaded centrally from environment variables and fails fast when
  required values are missing.
- CORS origins and trusted hosts are explicit lists.
- No credentials are baked into Docker images.
- Operational health is exposed outside the versioned application API. Future application
  endpoints belong under `/api/v1`.
