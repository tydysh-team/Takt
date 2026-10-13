# Takt

Takt — платформа для взаимодействия частных преподавателей и учеников. Foundation/Sprint 1 включает secure auth, single-role accounts (`ADMIN`, `TEACHER`, `STUDENT`), profiles, teacher–student connections, one-time invitations, dashboards и SQLAdmin. Расписание, уроки, домашние задания и прогресс ещё не реализованы; соответствующие UI-разделы — placeholders.

## Stack

- FastAPI, Pydantic, async SQLAlchemy, Alembic, PostgreSQL 17, SQLAdmin.
- React 19, TypeScript 6, Vite, React Router, TanStack Query, React Hook Form, Zod.
- Docker Compose; pytest/Ruff/mypy и Vitest/ESLint/TypeScript.

## Quick start

```shell
git clone https://github.com/tydysh-team/Takt.git
cd Takt
git switch feature/sprint1-foundation-implementation
```

Создайте local environment:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```shell
# Linux/macOS
cp .env.example .env
```

В `.env` замените PostgreSQL password (также внутри `DATABASE_URL`) и пять security placeholders независимыми local random values. Затем:

```shell
docker compose build
docker compose up -d
docker compose ps
docker compose exec backend python -m app.seed
```

Откройте frontend http://localhost:5173 и Swagger http://localhost:8000/api/docs. Backend автоматически применяет Alembic migrations; seed запускается вручную.

## Development credentials

После seed общий password: `TaktDemo!2026`.

- `teacher@demo.example.com`
- `student1@demo.example.com` (также `student2`, `student3`)
- `admin@demo.example.com` — для http://localhost:8000/admin

Только для local development.

## Tests

```shell
cd backend
ruff check .
mypy app alembic tests
pytest

cd ../frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Backend pytest требует отдельную migrated PostgreSQL из `TEST_DATABASE_URL`; настройка — в [docs/development.md](docs/development.md).

## Documentation

- [Индекс документации](docs/README.md)
- [Общая архитектура](docs/architecture.md)
- Backend: [архитектура](docs/backend/architecture.md), [модель данных](docs/backend/data-model.md), [API и DTO](docs/backend/api-and-dto.md), [сервисы](docs/backend/services-and-methods.md), [auth/security](docs/backend/authentication-and-security.md)
- Frontend: [архитектура](docs/frontend/architecture.md), [routes/pages](docs/frontend/routes-and-pages.md), [API/types](docs/frontend/api-and-types.md), [components/state](docs/frontend/components-and-state.md), [auth/guards](docs/frontend/authentication-and-guards.md)
- [Тестирование и качество](docs/testing-and-quality.md)
- [Разработка после clone](docs/development.md)

Полные команды, environment variables, test DB и безопасная остановка описаны в документации. Обычная остановка: `docker compose down`; `docker compose down -v` дополнительно удаляет local PostgreSQL volume.
