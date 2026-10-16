# Разработка после clone

## 1. Clone

```shell
git clone https://github.com/tydysh-team/Takt.git
cd Takt
git switch feature/sprint1-foundation-implementation
```

Ветка указана для текущего Sprint 1 handoff; после merge используйте нужную командную ветку.

## 2. Environment

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```shell
cp .env.example .env
```

Перед запуском замените `POSTGRES_PASSWORD` и пароль внутри `DATABASE_URL` одним локальным значением. Создайте независимые случайные значения длиной не менее 32 символов для `JWT_SECRET_KEY`, `REFRESH_TOKEN_HMAC_KEY`, `RATE_LIMIT_HMAC_KEY`, `INVITATION_CODE_SECRET`, `ADMIN_SESSION_SECRET`. Не коммитьте `.env`.

| Variable | Назначение |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Инициализация PostgreSQL |
| `DATABASE_URL` | Async SQLAlchemy URL; внутри compose host — `postgres` |
| `TEST_DATABASE_URL` | Отдельная migrated PostgreSQL для pytest |
| `APP_ENV` | `development`, `test`, `production`; secure cookies/seed behavior |
| `CORS_ORIGINS`, `TRUSTED_HOSTS` | Разрешённые browser origins/Host |
| `CORS_ALLOW_PRIVATE_NETWORK`, `ENABLE_HSTS` | Local-network preflight / HSTS |
| security keys | JWT, refresh/rate/invitation HMAC и SQLAdmin session |
| TTL/rate limit variables | Access/refresh/invitation сроки и IP limits |
| `BACKEND_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT` | Loopback published ports |
| `VITE_API_BASE_URL` | Public browser API origin; не secret |

`.env.example` содержит только development placeholders.

## 3. Docker

```shell
docker compose build
docker compose up -d
docker compose ps
```

`postgres` должен стать healthy, затем запускается backend; frontend ждёт healthy backend.

## 4. Database

Используется PostgreSQL 17. При каждом старте backend `backend/scripts/start.sh` автоматически выполняет `alembic upgrade head`, затем запускает Uvicorn. Вручную миграции для основной compose-БД запускать не требуется.

Development seed не запускается автоматически:

```shell
docker compose exec backend python -m app.seed
```

Seed разрешён только при `APP_ENV=development`, идемпотентен и создаёт demo users/relations.

Для host backend tooling требуется Python 3.12:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

Linux/macOS: используйте `.venv/bin/python`.

### Тестовая БД

Создайте отдельную БД (команда использует container environment; имя соответствует `.env.example`):

```shell
docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" takt_test'
```

На host задайте `DATABASE_URL` и `TEST_DATABASE_URL` одинаковым URL тестовой БД с `localhost`, примените migrations, затем pytest. Не направляйте тесты на development DB.

Windows PowerShell, заменив `<local-password>`:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+asyncpg://takt:<local-password>@localhost:5432/takt_test"
$env:TEST_DATABASE_URL = $env:DATABASE_URL
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\pytest
```

## 5. Addresses

- Frontend: http://localhost:5173
- Backend health: http://localhost:8000/health
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc
- OpenAPI JSON: http://localhost:8000/api/openapi.json
- SQLAdmin: http://localhost:8000/admin
- PostgreSQL: `localhost:5432` (loopback only)

## 6. Demo accounts

После seed password для всех demo accounts: `TaktDemo!2026`.

- `admin@demo.example.com` — `ADMIN` (SQLAdmin; email вводится в username).
- `teacher@demo.example.com` — `TEACHER`.
- `student1@demo.example.com`, `student2@demo.example.com`, `student3@demo.example.com` — `STUDENT`.

При первом seed Student 1 и Student 2 связываются с demo Teacher. Для Student 3 связь не создаётся, поэтому он недоступен через список и детали студентов этого Teacher.

Это намеренные development credentials; не использовать вне local development.

## 7. Tests

Backend из `backend/`:

```shell
ruff check .
mypy app alembic tests
pytest
```

Frontend из `frontend/`:

```shell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Подробнее: [testing-and-quality.md](testing-and-quality.md).

## 8. Stop

```shell
docker compose down
```

`docker compose down -v` дополнительно удаляет named volume `postgres_data` и все локальные данные PostgreSQL. Не используйте `-v` без явной необходимости сбросить БД.
