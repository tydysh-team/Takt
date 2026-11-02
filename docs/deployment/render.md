# Развёртывание Takt на Render (бесплатный тестовый контур)

Инструкция проверена по документации Render на 3 ноября 2026 года. Она рассчитана на **первое** развёртывание из GitHub. До шага создания Blueprint в Render ничего не публикуется. Выполнение шагов с `git commit`, `git push` и созданием ресурсов остаётся за владельцем репозитория.

## Что будет создано

- **takt-web** — один Docker Web Service на плане Free. Во время сборки Node 24 собирает React; в запущенном контейнере FastAPI отдаёт готовый сайт, `/api/v1`, `/api/docs`, `/admin` и `/health`.
- **takt-db** — PostgreSQL 17 на плане Free в том же регионе (`frankfurt`). `DATABASE_URL` берётся из внутреннего адреса БД автоматически.
- Один HTTPS origin, например `https://takt-web.onrender.com`, для браузера и API. Браузер обращается к `/api/v1` на этом же origin. Vite Dev Server в опубликованном приложении не работает.

Render завершает HTTPS на своём прокси и передаёт запрос контейнеру по HTTP. Приложение ставит `Secure` и `HttpOnly` у refresh-cookie, `Secure` у читаемой JavaScript CSRF-cookie; обе используют `SameSite=Lax`. Refresh-cookie ограничена путём `/api/v1/auth`, CSRF-cookie видна на `/`. Браузер отправляет запросы с `credentials: include`, а CSRF-токен — в `X-CSRF-Token`. Ротация refresh-токена остаётся в существующем backend.

## Шаг 1. Подготовьте GitHub-репозиторий

1. Убедитесь, что в ветке, которую будете развёртывать, есть корневые `render.yaml`, `Dockerfile`, `.dockerignore`, каталоги `backend/` и `frontend/`.
2. В корне проекта выполните `git status --short` и проверьте список изменений. Файл `.env` и любые реальные секреты должны оставаться только локально: он исключён в `.gitignore` и `.dockerignore`.
3. После просмотра изменений **самостоятельно** выполните команды ниже. Для обычного запуска выберите ветку `main`; если тестируете другую ветку, выберите её на шаге создания Blueprint. Эти команды не выполнялись при подготовке проекта.

   ```powershell
   git add Dockerfile .dockerignore .env.example render.yaml backend/app/core/config.py backend/app/core/static.py backend/app/main.py backend/scripts/start.sh backend/tests/unit/test_render_deployment.py frontend/src/shared/config/environment.ts docs/deployment/render.md
   git commit -m "Prepare Render deployment"
   $branch = git branch --show-current
   git push -u origin $branch
   ```
4. Убедитесь, что GitHub показывает обновлённый `render.yaml` в выбранной ветке. Приватный репозиторий подходит, если Render получит к нему доступ.

## Шаг 2. Зарегистрируйтесь и подключите GitHub

1. Откройте [Render Dashboard](https://dashboard.render.com/) и выберите **Get Started** или **Sign Up**; создайте аккаунт и подтвердите адрес почты, если сервис попросит.
2. В Dashboard выберите рабочее пространство. Нажмите **+ New → Blueprint**.
3. В подключении репозитория выберите **GitHub** и разрешите Render GitHub App доступ к нужному репозиторию. Если репозитория нет в списке, проверьте настройки доступа приложения Render в GitHub и обновите страницу.
4. Выберите репозиторий Takt, нужную ветку и путь Blueprint **`render.yaml`**. Нажмите **Connect**. Render покажет план ресурсов: `takt-web` и `takt-db`, оба **Free**, регион **Frankfurt**. Не создавайте эти ресурсы ещё раз через **New → Web Service/Postgres**.

## Шаг 3. Создайте ключ TOTP и примените Blueprint

`render.yaml` сам генерирует независимые значения для `JWT_SECRET_KEY`, `REFRESH_TOKEN_HMAC_KEY`, `RATE_LIMIT_HMAC_KEY`, `INVITATION_CODE_SECRET`, `ADMIN_SESSION_SECRET`, `MFA_BACKUP_HMAC_KEY`. Они не появляются в Git. `DATABASE_URL` Render берёт из `takt-db`; вручную вставлять его или добавлять `+asyncpg` не нужно — backend преобразует выданный Render `postgresql://...` в URL для asyncpg.

**Ваше ручное действие:** создать `TOTP_ENCRYPTION_KEY` в формате Fernet. Из корня проекта на Windows с установленными зависимостями backend:

```powershell
.\backend\.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

При отсутствии локального virtual environment можно создать ключ в доверенной локальной среде Python с пакетом `cryptography`. Результат — одна строка URL-safe Base64 длиной 44 символа, например формата `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=` (пример **не** является ключом). Сохраните настоящий ключ в менеджере секретов. Не отправляйте его в чат и не записывайте в Git.

При первой настройке Blueprint Render покажет поле для `TOTP_ENCRYPTION_KEY` (`sync: false`). Вставьте туда ключ. Проверьте, что `takt-web` и `takt-db` остаются на плане Free, затем нажмите **Deploy Blueprint** (или **Apply**, если так называется кнопка в текущем интерфейсе). Для `sync: false` Render спрашивает значение только при первом создании; позже его меняют в **takt-web → Environment**.

**Сохраняйте оба MFA-ключа неизменными между развёртываниями.** При потере `TOTP_ENCRYPTION_KEY` существующие TOTP-секреты нельзя расшифровать; при смене `MFA_BACKUP_HMAC_KEY` перестанут проверяться старые резервные коды. Для переноса БД нужен тот же набор ключей. `generateValue: true` не заменяет уже существующее значение при обычном обновлении Blueprint.

## Шаг 4. Дождитесь первого развёртывания

1. На странице Blueprint откройте `takt-web` → **Deploys**. Сборка должна пройти стадии `npm ci`, `npm run build`, установки Python-пакетов и запуска контейнера.
2. Стартовый скрипт запускает `alembic upgrade head` **до** Uvicorn. На Free Web Service Render не поддерживает отдельную pre-deploy команду, поэтому миграции намеренно выполняются при старте каждого экземпляра. Скрипт не запускает `app.seed`.
3. После миграций Uvicorn слушает `0.0.0.0:$PORT`; Render по умолчанию даёт `PORT=10000`. Health check настроен на `/health`. Когда проверка пройдёт, статус должен стать **Live**. Первый запуск может занять несколько минут.
4. Откройте выданный Render HTTPS-адрес `https://<имя-сервиса>.onrender.com`. Приоритет адреса — тот, что показывает Render; если имя `takt-web` уже занято, поддомен может отличаться. Backend автоматически добавляет `RENDER_EXTERNAL_HOSTNAME` в Trusted Hosts.

`/health` проверяет, что процесс отвечает. Успешное завершение `alembic upgrade head` в логах подтверждает первоначальное соединение с PostgreSQL и применение миграций; `/health` сам по себе не выполняет запрос к БД.

## Шаг 5. Проверьте сайт и функции

1. Откройте `https://<адрес>/`, затем обновите страницу на вложенном маршруте, например `/login`. React должен открыться без 404.
2. Откройте `https://<адрес>/health`: ожидается `{"status":"ok"}`. Откройте `/api/docs`: должна появиться документация API.
3. В `takt-web → Logs` найдите успешный `alembic upgrade head` / строки Alembic о переходе до последней миграции `20261031_0010`. Если БД была уже обновлена, новых переходов может не быть; отсутствие ошибки и статус **Live** достаточны для первого запуска.
4. Зарегистрируйте тестовые учётные записи, войдите и обновите страницу. Проверьте, что сессия восстанавливается через refresh-cookie. Затем проверьте смену пароля, включение TOTP, резервные коды, расписание и занятия.
5. В DevTools браузера (**Network** и **Application → Cookies**) проверьте, что запросы идут к тому же HTTPS-домену по `/api/v1`, у refresh-cookie есть `HttpOnly`, `Secure`, `SameSite=Lax`, а запрос `/api/v1/auth/refresh` отправляет `X-CSRF-Token`. В консоли не должно быть ошибок CORS или cookie.

## Переменные окружения

Текущие значения смотрите в **takt-web → Environment**. Значения, созданные Blueprint, не нужно дублировать вручную.

| Переменная | Как задаётся | Назначение |
| --- | --- | --- |
| `APP_ENV=production` | Blueprint | Secure-cookie и production-режим |
| `DATABASE_URL` | Ссылка `fromDatabase` на внутренний `connectionString` | PostgreSQL; преобразование к asyncpg делает backend |
| `JWT_SECRET_KEY` | Render `generateValue` | Подпись access JWT |
| `REFRESH_TOKEN_HMAC_KEY` | Render `generateValue` | Хеширование refresh-токенов |
| `RATE_LIMIT_HMAC_KEY` | Render `generateValue` | Ключирование IP для rate limiter |
| `INVITATION_CODE_SECRET` | Render `generateValue` | Коды приглашений |
| `ADMIN_SESSION_SECRET` | Render `generateValue` | Сессия `/admin` |
| `TOTP_ENCRYPTION_KEY` | Ввести вручную при создании Blueprint | Fernet-шифрование TOTP-секретов |
| `MFA_BACKUP_HMAC_KEY` | Render `generateValue` | Хеши резервных кодов и MFA challenge |
| `CORS_ORIGINS=[]` | Blueprint | Сайт и API одного origin; внешний origin не нужен |
| `TRUSTED_HOSTS=["localhost","127.0.0.1"]` | Blueprint + автоматический `RENDER_EXTERNAL_HOSTNAME` | Разрешённые HTTP Host; добавьте свой домен в этот JSON-список при подключении домена |
| `ENABLE_HSTS=true` | Blueprint | HSTS для HTTPS |
| `FORWARDED_ALLOW_IPS=*` | Blueprint | Uvicorn доверяет `X-Forwarded-For` от Render proxy для IP-based rate limiting |
| `PORT` | Render | Порт HTTP сервера; вручную задавать не требуется |

`VITE_API_BASE_URL` для опубликованного сайта **не задаётся**: фронтенд использует `window.location.origin`. Локальный Compose по-прежнему передаёт `VITE_API_BASE_URL=http://localhost:8000` своему Vite Dev Server. Если добавите собственный домен, обновите `TRUSTED_HOSTS` в **Environment**; `CORS_ORIGINS` остаётся `[]`, поскольку браузер и API всё ещё на одном домене.

`FORWARDED_ALLOW_IPS=*` предназначен для доступа через прокси Render. Не используйте этот режим, если запустите тот же контейнер напрямую в интернете: тогда клиент сможет подделывать forwarded-заголовки. Rate limiter хранит счётчики в памяти одного процесса; после перезапуска они обнуляются. На платном многопроцессном контуре потребуется общее хранилище, например Redis.

## Диагностика

- **Build failed** — откройте `takt-web → Deploys →` неудачный deploy → build log. Если ошибка в `npm ci` или `npm run build`, проверьте lock-файл и TypeScript; если в `pip install`, проверьте Python-зависимости.
- **Deploy failed / порт не найден** — откройте `takt-web → Logs`. После миграций должна быть строка Uvicorn о прослушивании `0.0.0.0` и заданного Render `PORT`. Ошибки до этой строки обычно связаны с окружением или БД.
- **Ошибка БД** — проверьте, что `takt-db` имеет статус **Available**, и что в `takt-web → Environment` есть `DATABASE_URL` из Blueprint. Не публикуйте его содержимое: там пароль. Убедитесь, что сервисы в одном регионе. По тексту Alembic ошибки определите неудачную миграцию.
- **`TOTP_ENCRYPTION_KEY` / validation error** — проверьте наличие Fernet-ключа в `Environment`; это не произвольная парольная строка. Если он менялся после создания пользователей с 2FA, верните прежний ключ.
- **400 Invalid host** — проверьте `RENDER_EXTERNAL_HOSTNAME` и `TRUSTED_HOSTS`; для своего домена добавьте его имя без `https://` и без порта.
- **404 при обновлении страницы** — убедитесь, что развёрнут корневой `Dockerfile` и `APP_ENV=production`, а не локальный `frontend/Dockerfile`.
- **401 или ошибка CSRF после входа** — в DevTools проверьте HTTPS, cookie и заголовок `X-CSRF-Token`; убедитесь, что запросы идут к тому же origin. После смены ключей старые сессии могут потребовать нового входа.
- **Медленный первый ответ** — Free сервис засыпает после 15 минут простоя и обычно просыпается примерно за минуту. Подождите, затем повторите запрос.

У Render Free нет shell/SSH и one-off jobs. Для просмотра состояния базы используйте раздел `takt-db` в Dashboard и логи `takt-web`. Не направляйте локальные тесты на эту БД и не выполняйте вручную seed для тестовых демонстраций с реальными данными.

## Обновления после изменений в GitHub

1. Проверьте изменения локально, затем **самостоятельно** сделайте commit и push в ветку, подключённую к Blueprint.
2. `autoDeployTrigger: commit` запускает новый deploy `takt-web`. Следите за **Deploys** и **Logs**. Миграции применяются при старте новой версии.
3. После статуса **Live** повторите короткий чек-лист ниже. Если изменился `render.yaml`, проверьте страницу **Blueprints** и синхронизацию конфигурации. Если добавили новую переменную с `sync: false` в уже существующий Blueprint, задайте её вручную в **Environment**.

## Чек-лист после первого запуска

- [ ] Сайт открывается по HTTPS.
- [ ] `/health` возвращает `{"status":"ok"}`; `/api/docs` открывается.
- [ ] PostgreSQL имеет статус Available; миграции успешно прошли по логам.
- [ ] Регистрация и вход работают.
- [ ] Обновление страницы восстанавливает сессию.
- [ ] Смена пароля, TOTP и резервные коды работают.
- [ ] Расписание и занятия работают.
- [ ] Нет ошибок CORS, cookie и CSRF в браузере.

## Ограничения Free и переход к production

По [официальным ограничениям Render Free](https://render.com/docs/free), Web Service засыпает после 15 минут без трафика, имеет эфемерную файловую систему и ограниченные месячные часы/минуты сборки. Free PostgreSQL — одна БД на workspace, до 1 ГБ, **истекает через 30 дней**; после истечения даётся 14 дней на переход на платный план, затем БД и данные удаляются. Автоматических резервных копий у Free PostgreSQL нет. Используйте только обезличенные тестовые данные. Планируйте перенос или обновление тарифа до истечения срока, если данные нужны дольше.

Для полноценного production понадобятся платные постоянные ресурсы, стратегия резервных копий и восстановления, мониторинг, общее хранилище rate limiting при масштабировании, отдельная pre-deploy миграция и контроль совместимости миграций со старой версией приложения во время rolling deploy. Для текущего одноэкземплярного тестового контура миграция при старте достаточна, но при изменении схемы старый процесс может некоторое время работать параллельно с уже обновлённой БД.

## Документация Render

- [Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Deploying on Render](https://render.com/docs/deploys)
- [Web Services and PORT](https://render.com/docs/web-services)
- [Health Checks](https://render.com/docs/health-checks)
- [Deploy for Free](https://render.com/docs/free)
