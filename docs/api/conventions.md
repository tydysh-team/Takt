# Общепроектные соглашения API

[К справочнику](../README.md) · [Контракты Sprint 1](contracts/sprint-01.md) · [Authentication](authentication.md) · [Ошибки](errors.md) · [Модель данных](../architecture/data-model.md) · [Интеграция](../architecture/integration.md) · [Шаблон API-контракта](../templates/api-contract.md)

## Baseline транспорта и имён

- Префикс всех прикладных маршрутов — `/api/v1`.
- Environment config Frontend содержит только origin Backend. Префикс `/api/v1` и resource path добавляет централизованный API-layer.
- Прикладные request / response bodies используют JSON в UTF-8.
- Для JSON-body используется `Content-Type: application/json`.
- Поля DTO и query parameters именуются на английском в `snake_case`.
- Resource paths используют lowercase и plural там, где это естественно для ресурса. Явно операционные auth-маршруты (`auth/register`, `auth/login`) допускаются как именованные действия.
- Request DTO содержит только поля, объявленные контрактом. Неизвестные body-поля отклоняются с HTTP `422`.
- Обязательность поля, его тип и допустимость `null` определяются конкретным API-контрактом. Отсутствие поля, `null`, пустая строка и пустой массив `[]` не считаются взаимозаменяемыми значениями.
- Доменные идентификаторы передаются как UUID-строки согласно [модели данных](../architecture/data-model.md).
- ID создаются Backend. Frontend не вычисляет Teacher ID или Student ID из Account ID.
- Успешный response возвращает конкретный DTO или массив DTO без общей `data`-оболочки.
- Пустая успешная коллекция возвращается как HTTP `200` и `[]`, а не `404`.
- Пагинация не входит в Sprint 1 и не добавляется без отдельного требования.
- Если порядок элементов имеет значение для сценария, сортировка и tie-breaker фиксируются в соответствующем API-контракте.

Правила этого документа являются общим инженерным baseline API и не расширяют Sprint scope.

## Authentication и пользовательский контекст

Защищённые операции используют `Authorization: Bearer <access_token>` согласно [authentication](authentication.md).

Frontend рассматривает access token как непрозрачную строку и не использует его внутреннее содержимое как самостоятельный источник продуктовых полномочий.

Backend определяет текущий Account, его роль и соответствующий Teacher / Student context из authentication context.

Клиентский Account ID, Teacher ID или Student ID не переопределяет identity текущего пользователя.

Если operation DTO содержит `student_id` или другой domain ID, он обозначает целевой ресурс операции, а не пользователя, от имени которого выполняется запрос.

## Даты и время

### Каноническая семантика обмена

1. Date-only передаётся строкой `YYYY-MM-DD`. Date-only не является абсолютным моментом времени.
2. Date-time передаётся строкой ISO 8601 с явным UTC offset или `Z`, например `2026-10-05T10:00:00+04:00`.
3. Naive date-time без timezone, Unix timestamps и локализованные строки не принимаются вместо date-time значения, если контракт требует абсолютный момент.
4. Backend нормализует date-time для сравнения как абсолютный момент и возвращает date-time значения в UTC.
5. Каноническое представление UTC в примерах и API-контрактах — суффикс `Z`, например `2026-10-05T06:00:00Z`.
6. Допустимы секунды и дробные секунды до микросекунд. Нулевая дробная часть может быть опущена.
7. Сравнение времени выполняется по абсолютным моментам, а не лексикографически по строкам.
8. PostgreSQL хранит `starts_at` как `timestamp with time zone` (`timestamptz`) согласно [модели данных](../architecture/data-model.md).
9. Отдельная пользовательская timezone в Sprint 1 не хранится.

### Семантика UI Sprint 1

Ввод и отображение date-time в UI выполняются в локальной timezone браузера пользователя согласно BR-12.

При создании Lesson Frontend:

1. получает локальные дату и время из UI;
2. интерпретирует их в локальной timezone браузера;
3. преобразует в timezone-aware ISO 8601 date-time;
4. отправляет абсолютный момент Backend.

При отображении Backend date-time Frontend преобразует UTC / timezone-aware значение обратно в локальную timezone браузера.

Backend не обязан хранить или восстанавливать исходное название timezone браузера.

### Upcoming и календарный диапазон

Для upcoming применяется BR-05:

`starts_at >= now`

Для создания Lesson применяется BR-08:

`starts_at >= now`

Для календаря применяется BR-07:

`from <= starts_at < to`

API календарного диапазона получает два timezone-aware date-time query parameters:

- `from`;
- `to`.

Для корректного диапазона требуется:

`from < to`

Граница `from` включается, `to` исключается.

Frontend формирует `from` / `to` по BR-12 как границы локальной календарной недели:

- `from` — понедельник выбранной недели `00:00:00` в локальной timezone браузера;
- `to` — понедельник следующей недели `00:00:00` в той же timezone.

После этого обе границы преобразуются в timezone-aware абсолютные моменты для API.

Границы календарных периодов вычисляются календарно в локальной timezone, а не прибавлением фиксированных `24` часов или `7 × 24` часов. Это предотвращает ошибки при изменении UTC offset / DST.

Проверка наличия timezone выполняется на API-границе. Некорректный transport format относится к request schema validation и возвращает `422`.

Корректно сформированные date-time значения с `from >= to` возвращают `400` с проектным кодом `invalid_date_range`.

Не вводить максимальную длину календарного диапазона или максимальную будущую дату без отдельного требования.

## HTTP-коды

| Код | Проектная политика |
| --- | --- |
| `200` | Успешное чтение или операция с response body, включая пустую коллекцию |
| `201` | Ресурс успешно создан |
| `204` | Успех без тела только если это явно определено контрактом; в текущем Sprint 1 baseline не требуется |
| `400` | Семантически некорректная операция при корректной request schema, если контракт не задаёт более специфичный статус |
| `401` | Authentication отсутствует, невалидна или истекла; для защищённых маршрутов используется `WWW-Authenticate: Bearer` |
| `403` | Account аутентифицирован, но роль или действие не разрешены |
| `404` | Ресурс не найден либо намеренно не раскрывается как чужой / недоступный ресурс |
| `405` | HTTP method не поддерживается данным route |
| `409` | Конфликт текущего состояния только для явно определённого контрактом случая |
| `422` | Request schema validation: отсутствующее поле, неверный тип / UUID / date-time / JSON, лишнее body-поле и аналогичные transport-level ошибки |
| `500` | Неожиданная server-side ошибка, включая response validation / serialization failure |

HTTP status всегда дополняется [единой моделью ошибок](errors.md).

Framework default error shape не является публичным контрактом проекта. Backend преобразует применимые FastAPI / Pydantic / HTTP exceptions в проектный ErrorDTO.

Response validation failure относится к server error и не возвращается клиенту как `422`.

`409` не используется как универсальный код любой бизнес-ошибки и не означает проверку пересечений Lesson, поскольку такая функция не входит в Sprint 1.

Конкретный error code для каждого ожидаемого случая фиксируется в [реестре ошибок](errors.md) и соответствующем API-контракте.

## Формат ошибок

Все прикладные ошибки Backend API используют единый ErrorDTO из [errors.md].

Frontend:

- ветвится по HTTP status и стабильному `error.code`;
- не принимает решения по тексту `message`;
- связывает field errors с формой через `details[].location`;
- рассматривает сетевой сбой, non-JSON response и несовместимый DTO как локальные transport / compatibility errors, а не как выдуманный Backend response.

API не возвращает клиенту stack traces, SQL, constraint names, secrets, password hashes, Bearer tokens или иные внутренние диагностические данные.

## Что должен содержать API-контракт

Каждый API-контракт Sprint 1 должен явно фиксировать:

- назначение и связанную User Story / Foundation task;
- method и path;
- требуемую authentication / role;
- path parameters;
- query parameters;
- request body DTO;
- обязательность, тип, nullable-семантику и ограничения полей;
- успешный HTTP status;
- response DTO;
- сортировку и tie-breaker, если порядок значим;
- применимые BR;
- ожидаемые HTTP statuses и стабильные error codes;
- временную семантику;
- примеры request / response;
- открытые решения, если они реально влияют на контракт.

Если параметр или request body отсутствует, это обозначается явно, а не оставляется на устное толкование.

Если для контракта существует блокирующее открытое решение, контракт не считается финальным до его разрешения.

API DTO не равен SQLAlchemy persistence model. Внешний контракт определяется отдельно от структуры ORM.

Если UI должен идентифицировать Teacher или Student пользователю, соответствующий response DTO предоставляет согласованное человекочитаемое представление (`display_name`) согласно BR-11; UUID не используется как единственная UI-подпись.

## Контракт, OpenAPI и изменения

Каноническая спецификация согласованного обмена находится в `docs/api/contracts/`.

Backend runtime OpenAPI генерируется из фактических FastAPI routes и Pydantic DTO и после реализации должен соответствовать утверждённому API-контракту.

Расхождение runtime OpenAPI, фактического HTTP-response и утверждённой спецификации без согласованного изменения считается дефектом или несогласованным изменением.

Frontend и Backend не меняют method / path, DTO, обязательность, типы, error codes, sorting или time semantics молча во время параллельной разработки.

Изменения API выполняются согласно [integration](../architecture/integration.md) и [change management](../process/change-management.md).

Для нового контракта использовать [шаблон API-контракта](../templates/api-contract.md).

## Технические источники

- [FastAPI — Handling Errors](https://fastapi.tiangolo.com/tutorial/handling-errors/)
- [Pydantic — AwareDatetime](https://docs.pydantic.dev/latest/api/types/#pydantic.types.AwareDatetime)
