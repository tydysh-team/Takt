# Takt

Takt is a web platform for organizing the learning process of private teachers and
students. This repository is a monorepo containing the FastAPI backend, React frontend,
and local Docker infrastructure.

The current implementation is the technical foundation only. It deliberately contains no
user, authentication, lesson, invitation, dashboard, or other domain functionality.

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
