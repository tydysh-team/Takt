# Backend: архитектура

Backend расположен в `backend/`; приложение — в `backend/app`.

| Каталог/файл | Содержание и ответственность |
|---|---|
| `app/api/` | HTTP layer: общий router, `/health`, cookies и dependencies |
| `app/api/routes/` | Routers для auth, `/me`, profile, invitations, connections, students, teachers, dashboard |
| `app/api/dependencies/` | Создание services, аутентификация Bearer JWT, role checks, CSRF и rate limit |
| `app/models/` | SQLAlchemy persistence models и enums; без API-форматирования |
| `app/schemas/` | Pydantic API DTO для request/response/error |
| `app/services/` | Бизнес-сценарии и транзакции (`commit`/`rollback`) |
| `app/repositories/` | DB access через `AsyncSession`; запросы, locks и `add`, без `commit` |
| `app/core/` | Settings, hashing/JWT, HMAC invitation codes, rate limiter, errors, middleware, logging, timezones |
| `app/db/` | Declarative `Base`, async engine/session factory и request-scoped session |
| `app/main.py` | FastAPI factory, middleware, exception handlers, routers, SQLAdmin |
| `app/admin.py` | SQLAdmin views и ADMIN-only session authentication |
| `app/seed.py` | Идемпотентный development seed |
| `alembic/` | Версионированные PostgreSQL migrations |
| `tests/` | HTTP/API integration tests и общая PostgreSQL fixture |
| `scripts/start.sh` | `alembic upgrade head`, затем Uvicorn |

## Границы слоёв

- Router принимает HTTP-ввод и возвращает schema. Его dependencies устанавливают текущего пользователя и нужную роль.
- Service реализует business logic + transactions. Сервис обязан завершить изменяющий сценарий `commit()` либо `rollback()`.
- Repository отвечает только за DB access и не делает `commit()`; транзакцией владеет service.
- Model — persistence: таблицы, FK, indexes, constraints и ORM relationships.
- Schema — API DTO; DTO намеренно не раскрывают `password_hash`, token HMAC digest, invitation digest и внутренние session fields.

`get_db_session()` откатывает транзакцию при необработанном исключении. Для атомарности критичные строки читаются с `FOR UPDATE`: пользователь при login, refresh-session при rotation, invitation при accept/revoke и relation при изменении.
