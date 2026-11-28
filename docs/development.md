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


## Групповые занятия: реализация и локальное применение 28.11.2026

Реализованы единые занятия с участниками, атомарные недельные серии, перенос и отмена целого
занятия, персональная посещаемость с возвратом в `not_set`, расписания, история и прежние формулы
прогресса. Backend ограничивает состав DTO по роли; имена других учеников доступны участнику
только через подробности группы. Порядок блокировок совместим с существующими операциями:
преподаватель → ученики по UUID → связи/занятие. Чужой конфликт ученика имеет приоритет и
не подтверждается. Чтение использует EXISTS и пакетную загрузку участников/профилей.

Локально подтверждены Compose-проект `takt`, сервис `postgres`, DATABASE_URL с host `postgres`
и база `takt`; внешний порт БД привязан только к `127.0.0.1:15432`. Перед миграцией Backend
остановлен. Полный custom-архив создан `pg_dump -Fc`, проверен через `pg_restore --list` и
полное чтение `pg_restore --file=/dev/null`, скопирован на host. Исходный и скопированный архивы
имеют одинаковый SHA-256. Архив находится в игнорируемом каталоге:
`.tmp/group-lessons-20261128/takt-before-group-lessons-20261128.dump` (50 048 байт).
SHA-256: `f00dcc2cd0559a6ee5fd7435729699ba4dc9fff2108c9b0b89eaf33b575b2a18`.

Миграция `20261110_0012 → 20261128_0013` применена; `alembic current` показывает head.
До и после: 35 занятий, 2 `PRESENT`, 0 `ABSENT`, 33 NULL; после — 35 участников.
Совпали контрольные суммы всех общих характеристик занятий (включая ID) и полного набора
`lesson_id`, `student_id`, отметки и её времени; перед удалением колонок миграция также
выполнила точное двустороннее сравнение EXCEPT. Число записей во всех прежних таблицах
не изменилось; ENUM остался `{PRESENT,ABSENT}`. Контрольные снимки — `before.json`, `after.json`
рядом с архивом. Backend и Frontend пересобраны для локального запуска и имеют статус healthy.

Автоматические тесты, линтеры, typecheck и отдельная проверочная сборка не запускались.
Выполнены чтение diff и статический разбор AST изменённых Python/TypeScript/TSX без исполнения
их кода. Новые тесты покрывают создание и совместимость, права и состав, групповые и серийные
конфликты, детерминированные блокировки, конкурентные группы у разных преподавателей,
откат при ошибке commit, перенос и отмену, персональные отметки и сброс, N/A и периоды,
приватность, отсутствие дубликатов и постоянное число запросов, перенос legacy-данных и
безопасный отказ downgrade. Frontend-тесты покрывают выбор типа, сохранение полей, поиск,
чекбоксы, удаление выбранного, валидацию, payload, неделю и список, представления ролей,
персональные действия, конфликты и инвалидацию кэша нескольких учеников. Прежние проверки
адаптированы к участникам. Тесты БД используют только явный TEST_DATABASE_URL с именем
`test_*` или `*_test`; миграционные проверки — отдельную схему в откатываемой транзакции.

Перед приёмкой вручную проверить:

- Индивидуальную встречу, группу из 2–3 учеников и недельную серию; переключение типа,
  поиск и длинный список на узком экране, сохранение черновика после ошибок.
- Преподавательское подтверждение пересечения и блокирующие конфликты нескольких учеников;
  конкурентное создание пересекающихся групп в двух сессиях разных преподавателей.
- Перенос всей группы, в том числе между периодами; отмену с причиной и освобождение интервала.
- Независимые `present`, `absent`, `not_set`, сброс индивидуальной отметки и ограничения статуса.
- Неделю/список обеих ролей, отсутствие имён в сетке, имена и «Вы» в подробностях ученика,
  отсутствие чужой посещаемости, контактов, ID, ссылок и дублирования busy-интервалов.
- Историю/прогресс обеих ролей: N/A, отмеченные/неотмеченные/отменённые занятия,
  границы периода и часовых поясов, прежние сценарии R-01—R-05 для ДЗ и оценок.

Ограничения проверки: тесты и проверка типов остаются невыполненными; downgrade и восстановление
архива в отдельную БД локально не выполнялись. Читаемость архива и фактическое сохранение данных
при upgrade подтверждены отдельно. Существующие Backend-зависимости заданы диапазонами без
lock-файла: пересборка разрешает версии заново; манифесты зависимостей не изменены.
Коммиты, staging, push и другие изменяющие состояние Git операции не выполнялись; ветка `dev`
сохранена. Авторизация, 2FA, профили, приглашения, ДЗ, оценки и файловое хранилище не изменены.

Добавленные файлы:

- `backend/alembic/versions/20261128_0013_lesson_participants.py`
- `backend/tests/api/test_group_concurrency.py`
- `backend/tests/api/test_group_lessons.py`
- `backend/tests/api/test_lesson_participants_migration.py`
- `backend/tests/unit/test_group_locks.py`
- `frontend/src/features/lessons/LessonParticipants.tsx`
- `frontend/src/features/lessons/group-lessons.test.tsx`
- `frontend/src/pages/SchedulePage.groups.test.tsx`

Изменённые файлы:

- `backend/app/api/routes/lessons.py`
- `backend/app/core/errors.py`
- `backend/app/core/exceptions.py`
- `backend/app/models/__init__.py`
- `backend/app/models/lesson.py`
- `backend/app/repositories/lessons.py`
- `backend/app/schemas/lessons.py`
- `backend/app/services/lesson_views.py`
- `backend/app/services/lessons.py`
- `backend/app/services/progress.py`
- `backend/tests/api/test_lesson_attendance.py`
- `backend/tests/api/test_lesson_history.py`
- `backend/tests/api/test_lesson_read.py`
- `backend/tests/api/test_lesson_schedule.py`
- `backend/tests/api/test_lesson_schedule_concurrency.py`
- `backend/tests/api/test_lesson_series.py`
- `backend/tests/api/test_lessons.py`
- `backend/tests/api/test_person_schedule.py`
- `backend/tests/api/test_progress.py`
- `backend/tests/conftest.py`
- `backend/tests/unit/test_lesson_requests.py`
- `backend/tests/unit/test_lesson_views.py`
- `docs/backend/api-and-dto.md`
- `docs/backend/data-model.md`
- `docs/development.md`
- `docs/frontend/api-and-types.md`
- `docs/general/progress-statistics.md`
- `frontend/src/api/invalidation.ts`
- `frontend/src/api/queries.ts`
- `frontend/src/api/types.ts`
- `frontend/src/features/lessons/LessonCreateForm.tsx`
- `frontend/src/features/lessons/schedule-context.ts`
- `frontend/src/features/lessons/student-conflict.ts`
- `frontend/src/pages/SchedulePage.tsx`
- `frontend/src/shared/application.css`
