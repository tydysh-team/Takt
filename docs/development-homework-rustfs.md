# Epic 2, этап 1: RustFS и домашние задания

## Запуск и настройка

В корневом `.env` задайте разные случайные значения `RUSTFS_ACCESS_KEY` и `RUSTFS_SECRET_KEY`. Не используйте `rustfsadmin`. Для Backend, запущенного вне Compose, задайте `S3_ENDPOINT_URL=http://127.0.0.1:9000` и те же значения `S3_ACCESS_KEY`, `S3_SECRET_KEY`; `S3_BUCKET=takt-homework`, `S3_REGION=us-east-1`. В Compose Backend получает ключи из `RUSTFS_*` автоматически.

```powershell
docker compose up -d rustfs backend frontend
docker compose ps
curl.exe -f http://127.0.0.1:9000/health
curl.exe -f http://127.0.0.1:9001/rustfs/console/health
```

Откройте Console: <http://127.0.0.1:9001>. S3 API: <http://127.0.0.1:9000>. Оба порта опубликованы только на loopback. `rustfs/rustfs:1.0.4` работает от UID/GID `10001:10001`; одноразовый `rustfs_permissions` выдаёт этому пользователю права на именованный том `rustfs_data`. `RUSTFS_VOLUMES=/data` задаёт одну локальную директорию. Режим SNSD не имеет избыточности; данные сохраняются в Docker volume. Не используйте `docker compose down -v`.

## Bucket и проверка доступа

Backend создаёт `takt-homework` при первой загрузке файла через S3 `CreateBucket`. Можно создать его заранее в Console; **не включайте анонимную политику**. Для проверки через AWS CLI настройте локальный профиль с ключами RustFS (не передавайте их Frontend):

```powershell
aws --endpoint-url http://127.0.0.1:9000 s3api head-bucket --bucket takt-homework --profile takt-local
curl.exe -i http://127.0.0.1:9000/takt-homework/
```

Анонимный `curl` должен получить `403 AccessDenied`, а не список объектов. Если bucket ещё не создан, сначала назначьте задание с файлом либо создайте bucket в Console. Для прямой проверки S3 используйте отдельный временный bucket, например `takt-homework-smoke`, затем загрузите и скачайте туда файл через AWS CLI или boto3 и сравните SHA-256. Не удаляйте файлы из рабочего bucket ради smoke-теста.

Для проверки сохранности без удаления тома:

```powershell
docker compose up -d --force-recreate rustfs
docker compose ps rustfs
aws --endpoint-url http://127.0.0.1:9000 s3api head-object --bucket takt-homework --key assignments/ID_ЗАДАНИЯ/ID_ФАЙЛА --profile takt-local
```

В репозитории есть повторяемый smoke-тест, который создаёт **отдельный временный bucket** и проверяет SHA-256 и отказ анонимного GET. Из `backend` запустите `python scripts/smoke_rustfs.py prepare`, затем пересоздайте только RustFS командой `docker compose up -d --force-recreate --no-deps rustfs` из корня и выполните `python scripts/smoke_rustfs.py verify`, `python scripts/smoke_rustfs.py cleanup`. Не запускайте `cleanup` для рабочего bucket.

## Работа через Takt

Преподаватель открывает «Ученики → карточка ученика → Домашние задания», нажимает «Назначить ДЗ», указывает название, срок и при необходимости описание и материалы. После подтверждения Backend задание появляется в списке. Ученик открывает «Домашние задания» или «Преподаватели → карточка преподавателя → Домашние задания», выбирает задание и скачивает материалы. Ссылка на S3 и ключи в браузер не передаются; скачивание идёт через авторизованный Backend.

Контракт создания: `POST /api/v1/homework`, multipart-поля `student_id`, `title`, `description`, `due_at`, повторяемое `files` и обязательный заголовок `Idempotency-Key` (UUID). Повтор того же запроса с тем же ключом возвращает прежнее задание; другой payload с тем же ключом даёт `409`. Лимиты: 5 файлов по 10 МБ, PDF, DOCX, TXT (UTF-8), PNG и JPEG. Backend проверяет содержимое, а не только имя или MIME. Ключи объектов имеют вид `assignments/{homework_id}/{attachment_id}`. В БД хранятся метаданные и SHA-256, содержимое остаётся в RustFS.

Списки с `limit` (1–100) и `offset`: `GET /api/v1/homework?student_id=...` для преподавателя, `GET /api/v1/students/me/homework?teacher_id=...` для ученика. Детали: `GET /api/v1/homework/{id}` и `GET /api/v1/students/me/homework/{id}`. Скачивание: `GET /api/v1/homework/{id}/attachments/{attachment_id}/download` с Bearer JWT.

Загрузка и запись БД выполняются как единое действие на уровне пользователя: при ошибке загрузки/commit транзакция откатывается, загруженные объекты удаляются компенсирующим действием. Если RustFS недоступен и компенсация тоже не сработала, Backend пишет ошибку с `storage_key` в лог. После восстановления оператор запускает `docker compose exec backend python scripts/reconcile_homework_objects.py`: скрипт показывает только объекты `assignments/` старше 24 часов, которых нет в PostgreSQL. После проверки списка можно выполнить его с `--delete`. За один запуск он просматривает максимум 1000 объектов и удаляет максимум 100; если список усечён, требуется дополнительная проверка. Скрипт не удаляет объекты, упоминаемые в БД, и не затрагивает `submissions/`.

## Резервное копирование

Делайте согласованный backup PostgreSQL (`pg_dump`) и тома `rustfs_data` или S3-копию bucket. Перед backup приостановите создание новых ДЗ либо зафиксируйте общий момент, затем проверьте восстановление обоих наборов данных в отдельной среде. Одна копия PostgreSQL не содержит файлов; одна копия RustFS не содержит прав доступа и метаданных Takt.

## Проверки

Backend требует отдельную мигрированную PostgreSQL, заданную `TEST_DATABASE_URL`; рабочую базу не используйте. Для полного существующего набора тестов база должна называться `takt_test` (это имя проверяет один из тестов MFA); можно запустить её на отдельном порту, например 5433. Перед полным запуском направьте и `DATABASE_URL`, и `TEST_DATABASE_URL` на эту тестовую базу: MFA concurrency test использует оба адреса и выполняет реальные транзакции. Выполните `alembic upgrade head` на тестовой БД, затем из `backend`:

```powershell
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check .
.\.venv\Scripts\python -m mypy app alembic tests
```

Из `frontend`: `npm test`, `npm run typecheck`, `npm run lint`. Интеграционный S3 smoke-тест выполняйте только в отдельном bucket. Проверку анонимного отказа и сохранности после пересоздания контейнера проводите на работающем Docker Engine.

## Открытые решения для следующих этапов

Продуктовая документация не фиксирует шкалу оценки, допустимость сдачи после срока и точные лимиты файлов. Перед US-12–US-17 нужно согласовать эти правила; для `grade` пока не задан диапазон в схеме БД. Статусы и `due_at` следуют общему контракту Epic 2. Submission и Review пока представлены только в схеме БД.
