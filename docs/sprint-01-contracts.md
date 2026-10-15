# Sprint 1 — Contracts

Документ фиксирует внешние контракты, необходимые для совместной работы Frontend и Backend в Sprint 1.

Контракт определяет наблюдаемое поведение на границе компонентов.

Внутренняя архитектура, структура БД, ORM-модели, token implementation, hashing mechanism, структура сервисов и другие implementation details этим документом не определяются.

# 1. Общие API conventions

## Base path

Прикладные API Sprint 1 используют prefix:

`/api/v1`

Frontend получает Backend origin из environment configuration.

## Transport

Request / response body передаются в JSON.

Для JSON request используется:

`Content-Type: application/json`

Имена JSON-полей и query parameters используют `snake_case`.

## Success responses

Успешный response возвращает непосредственно согласованный DTO или массив DTO без обязательной общей `data`-обёртки.

Пустая успешная коллекция:

- HTTP `200`;
- body `[]`.

## Authentication

Защищённые операции Sprint 1 используют:

`Authorization: Bearer <access_token>`

Access token является непрозрачным credential для Frontend.

Frontend не должен определять полномочия пользователя только на основании внутреннего содержимого token.

Backend является доверенным источником identity и самостоятельно определяет текущего пользователя и его роль.

Конкретный формат token, алгоритм его создания, срок жизни и способ внутренней проверки определяются Backend-разработчиками.

## Authorization

Frontend controls, скрытые кнопки и client-side routing не заменяют Backend authorization.

Backend обязан проверять допустимость защищённой операции для текущего пользователя.

Client не должен иметь возможность выполнить действие от имени другого пользователя простой подменой переданного идентификатора.

# 2. Общие DTO

## Role

Допустимые значения:

`TEACHER | STUDENT`

## UserContextDTO

Минимальный внешний контекст пользователя:

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "email": "teacher@example.com",
  "role": "TEACHER",
  "first_name": "Анна",
  "last_name": "Петрова",
  "middle_name": "Сергеевна"
}
```

| Поле | Требование |
| --- | --- |
| `id` | уникальный ID текущего пользователя |
| `email` | email учетной записи |
| `role` | `TEACHER` или `STUDENT` |
| `first_name` | обязательное имя |
| `last_name` | обязательная фамилия |
| `middle_name` | строка или `null` |

`UserContextDTO` не определяет внутреннюю структуру User / Profile / Teacher / Student в Backend.

## RegisterResponseDTO

Ответ после успешной регистрации пользователя.

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "email": "teacher@example.com",
  "role": "TEACHER",
  "first_name": "Анна",
  "last_name": "Петрова",
  "middle_name": "Сергеевна",
  "created_at": "2026-10-16T12:00:00Z"
}
```

| Поле | Требование |
| --- | --- |
| `id` | уникальный ID текущего пользователя |
| `email` | email учетной записи |
| `role` | `TEACHER` или `STUDENT` |
| `first_name` | обязательное имя |
| `last_name` | обязательная фамилия |
| `middle_name` | строка или `null` |
| `created_at` | дата и время создания учётной записи |

## TokenDTO

```json
{
  "access_token": "opaque-token",
  "token_type": "bearer"
}
```

`access_token`:

- обязателен;
- является непустой строкой;
- рассматривается Frontend как opaque value.

`token_type` имеет значение:

`bearer`

# 3. Error contract

Все ожидаемые API errors используют единый внешний формат:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable message.",
    "details": []
  }
}
```

| Поле | Назначение |
| --- | --- |
| `error.code` | стабильный machine-readable код ошибки |
| `error.message` | безопасное человекочитаемое сообщение |
| `error.details` | дополнительные детали либо `[]` |

Frontend принимает программные решения по HTTP status и `error.code`, а не по тексту `message`.

В публичный error response не должны попадать:

- stack trace;
- SQL;
- database errors;
- password;
- password hash;
- access token;
- secrets;
- внутренние exception details.

## Общая HTTP-семантика

| HTTP | Значение |
| ---: | --- |
| `200` | успешное получение / операция |
| `201` | успешное создание |
| `400` | семантически некорректная операция |
| `401` | authentication отсутствует или недействительна |
| `403` | пользователь определён, но операция ему запрещена |
| `404` | требуемый ресурс недоступен / не найден |
| `409` | конфликт текущего состояния |
| `422` | request не соответствует ожидаемому формату |
| `500` | неожиданная server-side ошибка |

Framework-specific error response не является внешним контрактом.

Конкретные error codes определяются контрактом соответствующей операции.

# 4. F-06 — Authentication contracts

## API-01 — Registration

**Method:** `POST`

**Path:** `/api/v1/auth/register`

**Authentication:** не требуется.

### Request

```json
{
  "email": "teacher@example.com",
  "password": "example-password",
  "role": "TEACHER",
  "first_name": "Анна",
  "last_name": "Петрова",
  "middle_name": "Сергеевна"
}
```

Обязательные поля:

- `email`;
- `password`;
- `role`;
- `first_name`;
- `last_name`.

`middle_name` является опциональным и может быть `null`.

Правила значений определены в `sprint-01-requirements.md`.

### Success

HTTP `201`.

Response: `RegisterResponseDTO`.

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "email": "teacher@example.com",
  "role": "TEACHER",
  "first_name": "Анна",
  "last_name": "Петрова",
  "middle_name": "Сергеевна",
  "created_at": "2026-10-16T12:00:00Z"
}
```

Регистрация не выполняет автоматический login и не возвращает access token.

Access token получается через API-02 — Login.

### Expected errors

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `422` | `validation_error` | регистрационные данные некорректны |
| `409` | `email_already_registered` | нормализованный email уже используется |
| `500` | `internal_error` | неожиданная Backend error |

Способ атомарного создания необходимых внутренних сущностей является ответственностью Backend implementation.

---

## API-02 — Login

**Method:** `POST`

**Path:** `/api/v1/auth/login`

**Authentication:** не требуется.

### Request

```json
{
  "email": "teacher@example.com",
  "password": "example-password"
}
```

### Success

HTTP `200`.

Response: `TokenDTO`.

```json
{
  "access_token": "opaque-token",
  "token_type": "bearer"
}
```

### Expected errors

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `422` | `validation_error` | request имеет некорректный формат |
| `401` | `invalid_credentials` | email или password неверны |
| `500` | `internal_error` | неожиданная Backend error |

Неизвестный email и неправильный password не должны различаться публичным ответом.

---

## API-03 — Current User

**Method:** `GET`

**Path:** `/api/v1/me`

**Authentication:** Bearer.

### Request

Body отсутствует.

Frontend не передаёт идентификатор пользователя, которого необходимо считать текущим.

### Success

HTTP `200`.

Response: `UserContextDTO`.

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "email": "teacher@example.com",
  "role": "TEACHER",
  "first_name": "Анна",
  "last_name": "Петрова",
  "middle_name": "Сергеевна"
}
```

Backend формирует response на основании authentication context.

### Expected errors

| HTTP | `error.code` | Условие |
| ---: | --- | --- |
| `401` | `authentication_required` | действующая authentication отсутствует |
| `500` | `internal_error` | неожиданная Backend error |

# 5. F-08 — Frontend ↔ Backend contract

Frontend должен взаимодействовать с Backend согласно согласованному API contract.

Для интеграционного контура обязательно:

- Backend origin задаётся через environment configuration;
- прикладные requests используют `/api/v1`;
- protected requests передают Bearer credential;
- Backend самостоятельно определяет trusted current user;
- Frontend корректно обрабатывает success response;
- Frontend корректно обрабатывает ErrorDTO;
- CORS разрешает согласованный Frontend origin;
- интеграция проверяется реальным HTTP exchange.

Минимальный Foundation smoke flow:

```text
Frontend
→ POST /api/v1/auth/login
→ получить access token
→ GET /api/v1/me
→ получить текущего пользователя
→ отобразить данные пользователя
```

Также должен быть проверен error flow, например:

```text
Frontend
→ protected request без действующего credential
→ Backend 401 authentication_required
→ Frontend корректно обрабатывает ошибку
```

Mock response не является достаточным подтверждением выполнения F-08.

## Transport failures

Следующие ситуации не считаются корректным Backend ErrorDTO:

- network failure;
- timeout;
- CORS failure;
- non-JSON response;
- response, несовместимый с ожидаемым DTO.

Frontend должен безопасно обработать такой случай как integration / transport error.

Конкретный способ реализации HTTP-взаимодействия и обработки состояния определяется Frontend-разработчиком.

# 6. Изменение контракта

Frontend и Backend могут предлагать изменение внешнего контракта.

Изменение:

- method;
- path;
- authentication transport;
- request DTO;
- response DTO;
- обязательности полей;
- HTTP semantics;
- `error.code`

должно быть согласовано между затронутыми участниками до того, как новое поведение считается ожидаемым.

Одностороннее изменение реализации не изменяет утверждённый контракт.

Если фактический Frontend / Backend exchange не соответствует согласованному контракту, задача не считается корректно интегрированной до согласования изменения либо исправления реализации.

# 7. User Story contracts

Контракты `US-01–US-03` добавляются после согласования Foundation baseline.

Их внутренний способ реализации остаётся ответственностью разработчиков; в документации фиксируется только необходимый внешний контракт.
