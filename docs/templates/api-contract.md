# Шаблон API-контракта

[К справочнику](../README.md) · [API conventions](../api/conventions.md) · [Authentication](../api/authentication.md) · [Error model](../api/errors.md) · [Integration](../architecture/integration.md) · [Change Management](../process/change-management.md)

## Как использовать

Этот шаблон применяется для нового либо изменяемого HTTP endpoint.

Канонический исполнимый контракт после согласования размещается в `docs/api/contracts/`.

Правила заполнения:

- заменить placeholder-текст конкретной схемой;
- явно указать отсутствующие path / query / body части;
- не оставлять required / nullable / type semantics «по умолчанию»;
- не использовать пример JSON как единственный источник схемы;
- не смешивать API DTO и SQLAlchemy model;
- не вводить новый `error.code`, которого нет в [реестре ошибок](../api/errors.md);
- не объявлять runtime OpenAPI самостоятельным источником нового решения;
- unresolved product blocker означает, что затронутая часть contract ещё не финальна;
- historical resolved Q не указывается как активный blocker;
- implementation choice I-* фиксируется только если действительно влияет на контракт; внутренний выбор, не меняющий HTTP semantics, не должен раздувать contract.

Статус API specification и статус реализации endpoint — разные вещи.

# 1. Карточка контракта

| Поле | Значение |
| --- | --- |
| Contract ID | `<API-XX>` |
| Название | `<операция>` |
| Статус specification | `Draft / Blocked / Approved / Superseded` |
| Parent | `<User Story / Foundation / Technical Task>` |
| Acceptance Criteria | `<AC ссылки>` |
| Business Rules | `<BR ссылки>` |
| Backend participants | `<owner / reviewer>` |
| Frontend participants | `<owner / reviewer / N/A>` |
| Consumers | `<Frontend feature / external consumer / N/A>` |
| Supersedes | `<старый contract / N/A>` |

`Approved` означает, что HTTP semantics согласованы для реализации.

`Approved` не означает, что endpoint уже реализован, протестирован или принят QA.

# 2. Назначение

Кратко описать:

- что делает операция;
- для какого пользовательского / Foundation сценария она нужна;
- какой результат считается успешным;
- что принципиально не входит в эту операцию.

Не добавлять future behavior только для «полноты» DTO.

# 3. Method и path

**Method:** `<GET / POST / PATCH / DELETE ...>`

**Path:**

```text
/api/v1/...
```

Проверить соответствие [общим API conventions](../api/conventions.md):

- прикладной prefix `/api/v1`;
- lowercase paths;
- plural resource names, где это естественно;
- operation-style auth paths только для согласованных действий.

# 4. Authentication и authorization

## Authentication

`<Bearer / не требуется>`

Если endpoint защищён:

```http
Authorization: Bearer <access_token>
```

Backend определяет current User и domain context из credential; при ролевой модели context может проходить через User → Profile → TeacherProfile / StudentProfile.

Client-supplied User / Profile / TeacherProfile / StudentProfile ID не может переопределять identity текущего пользователя.

## Role

Допустимая роль:

```text
<teacher / student / любой authenticated User / anonymous>
```

## Authorization rules

Указать:

- ownership;
- relation checks;
- resource visibility;
- допустимые target resource IDs;
- случаи concealed `404`, если существование чужого ресурса не раскрывается.

Пример формулировки:

```text
student_id является target resource.
Current Teacher определяется только Backend из authentication context.
```

Frontend route guard / hidden button не является security boundary.

# 5. Request

## Path parameters

Если отсутствуют:

```text
Path parameters: отсутствуют.
```

Если есть:

| Поле | Тип | Required | Nullable | Ограничения | Семантика |
| --- | --- | --- | --- | --- | --- |
| `<name>` | `<UUID / string / ...>` | `yes` | `no` | `<...>` | `<...>` |

## Query parameters

Если отсутствуют:

```text
Query parameters: отсутствуют.
```

Если есть:

| Поле | Тип | Required | Nullable | Default | Ограничения | Семантика |
| --- | --- | --- | --- | --- | --- | --- |
| `<name>` | `<type>` | `yes/no` | `yes/no` | `<value / none>` | `<...>` | `<...>` |

Для date-time query values явно указать timezone-aware ISO 8601 semantics.

## Headers

Указать только operation-specific headers.

Общие transport headers не нужно дублировать без причины.

## Request body

Если body отсутствует:

```text
Body: отсутствует.
```

Если body есть:

**Content-Type:** `application/json`

**DTO:** `<RequestDTO>`

| Поле | Тип | Required | Nullable | Ограничения | Нормализация / semantics |
| --- | --- | --- | --- | --- | --- |
| `<field>` | `<type>` | `yes` | `no` | `<...>` | `<...>` |

Неизвестные body-поля:

```text
Отклоняются с 422 validation_error.
```

Для строк явно определить, если применимо:

- trim / no trim;
- lowercase / preserve case;
- empty string semantics;
- min / max length.

Для enum перечислить допустимые literal values.

Для UUID не считать обычную string автоматически допустимым domain identifier без validation.

# 6. Request example

Пример должен соответствовать таблице Request DTO.

```http
POST /api/v1/example
Authorization: Bearer example-access-token
Content-Type: application/json

{
  "field": "value"
}
```

Правила примеров:

- UUID — вымышленные;
- credential — вымышленный;
- персональные данные — вымышленные;
- date-time — timezone-aware;
- поля и типы совпадают с final schema.

Если contract ещё `Blocked`, пример не должен создавать впечатление, что неизвестная часть уже утверждена.

# 7. Authoritative processing rules

Описать только значимые для внешнего contract / correctness шаги.

Пример:

1. Backend authenticates request.
2. Определяет trusted domain context.
3. Выполняет schema validation.
4. Фиксирует единое `now`, если operation зависит от текущего времени.
5. Проверяет применимые Business Rules.
6. Выполняет persistence operation в требуемой transaction boundary.
7. Commit завершён до success response.
8. Формирует response DTO.

Не превращать этот раздел в псевдокод внутренней реализации, если детали не влияют на контракт.

# 8. Validation и Business Rules

Разделить четыре класса ошибок.

## 8.1 Transport / schema validation

Примеры:

- missing required field;
- unknown body field;
- invalid JSON;
- invalid UUID;
- invalid type;
- naive / invalid date-time;
- invalid email;
- length / enum constraint.

Ожидаемый baseline:

```text
422 validation_error
```

Field details должны соответствовать [ErrorDTO](../api/errors.md).

## 8.2 Semantic validation

Корректный transport, но недопустимая операция.

Примеры:

- `from >= to`;
- `starts_at < now`.

Для каждого случая указать конкретный status и зарегистрированный `error.code`.

## 8.3 Authentication

Например:

```text
401 authentication_required
401 invalid_credentials
```

Указать только реально применимые операции.

## 8.4 Authorization / resource availability

Например:

```text
403 forbidden
404 student_not_available
```

Явно указать, когда `404` объединяет «не существует» и «недоступен текущему пользователю».

# 9. Success response

**HTTP:** `<200 / 201 / 204>`

**DTO:** `<ResponseDTO / DTO[] / no body>`

Если response body есть:

| Поле | Тип | Required | Nullable | Семантика |
| --- | --- | --- | --- | --- |
| `<field>` | `<type>` | `yes` | `no` | `<...>` |

Если DTO содержит Teacher / Student, которого пользователь должен идентифицировать, reference должен включать `first_name`, `last_name` и nullable `middle_name` согласно BR-11.

UUID не используется как единственная UI-подпись.

## Empty result

Для collection endpoint явно определить empty semantics.

Sprint 1 baseline:

```http
200
```

```json
[]
```

Не использовать `404` для корректной пустой коллекции.

## Sorting

Если порядок значим:

```text
<primary sort>, <tie-breaker>
```

Пример:

```text
starts_at ASC, id ASC
```

Если порядок не имеет contract semantics, написать это явно.

## Success timing

Для операции записи указать, когда успех считается подтверждённым.

Пример:

```text
201 возвращается только после успешного commit.
```

# 10. Success example

```json
{
  "id": "11111111-1111-4111-8111-111111111111"
}
```

Пример обязан соответствовать Response DTO по:

- field names;
- types;
- required fields;
- nullable semantics;
- date-time format;
- nested objects.

# 11. Error responses

Все ошибки используют единый [ErrorDTO](../api/errors.md).

| HTTP | `error.code` | Условие | `details` | Frontend reaction |
| ---: | --- | --- | --- | --- |
| `422` | `validation_error` | `<schema error>` | `<field details>` | `<form / general error>` |
| `401` | `<...>` | `<...>` | `[]` | `<...>` |
| `403` | `forbidden` | `<...>` | `[]` | `<...>` |
| `404` | `<...>` | `<...>` | `[]` | `<...>` |
| `409` | `<...>` | `<...>` | `[]` | `<...>` |
| `500` | `internal_error` | unexpected server-side failure | `[]` | general retry / error state |

Не добавлять status/code «на всякий случай».

Endpoint contract перечисляет только реально применимые ожидаемые errors.

Framework default FastAPI / Pydantic shape не является публичным contract.

# 12. Error examples

Пример field validation:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [
      {
        "location": ["body", "field"],
        "code": "invalid_value",
        "message": "Invalid value."
      }
    ]
  }
}
```

Пример business / access error:

```json
{
  "error": {
    "code": "forbidden",
    "message": "Operation is not allowed.",
    "details": []
  }
}
```

Examples не должны содержать:

- реальные Bearer tokens;
- passwords;
- password hashes;
- SQL;
- stack traces;
- constraint names;
- реальные private data.

# 13. Date / time semantics

Если endpoint не использует date/time:

```text
N/A — endpoint не принимает и не возвращает date/time.
```

Если использует, определить:

- input format;
- timezone requirement;
- comparison semantics;
- Backend normalization;
- response timezone;
- boundary rules;
- use of `now`;
- UI conversion, если endpoint предназначен Frontend.

Sprint 1 baseline:

- абсолютный date-time — ISO 8601 с offset или `Z`;
- naive date-time не принимается;
- Backend сравнивает absolute moments;
- Backend response date-time — UTC с `Z`;
- `now` фиксируется один раз на operation, если BR зависит от текущего времени;
- browser-local timezone существует только на UI boundary согласно BR-12;
- календарные local boundaries не вычисляются фиксированным `7 × 24h` при DST.

Не вводить arbitrary max date / range без отдельного requirement.

# 14. Persistence / transaction semantics

Если endpoint не изменяет persisted data:

```text
N/A — операция read-only.
```

Если изменяет:

- какие entities создаются / изменяются;
- какие invariants проверяются;
- transaction boundary;
- atomicity;
- commit-before-success;
- expected known DB conflicts;
- rollback expectations.

Не раскрывать persistence model как API schema.

Known DB conflict может mapping-иться в согласованный project error, но raw database exception не возвращается клиенту.

# 15. Idempotency / повтор запроса

Явно определить только если это важно.

Если idempotency contract отсутствует:

```text
Специальная idempotency semantics не определена.
Client не должен предполагать безопасный автоматический retry операции записи.
```

Не объявлять POST идемпотентным без отдельного механизма / требования.

# 16. Compatibility и breaking impact

Указать:

- новый endpoint или изменение существующего;
- affected consumers;
- backward-compatible / breaking;
- old behavior;
- new behavior;
- порядок обновления Backend / Frontend;
- нужна ли временная совместимость;
- какие mocks / tests / docs становятся неактуальны.

Breaking change проходит [Change Management](../process/change-management.md).

Следующие изменения считаются contract-significant:

- method / path;
- auth / role;
- request / response fields;
- required / nullable semantics;
- type;
- HTTP status;
- stable `error.code`;
- sorting;
- time semantics.

# 17. Open decisions

Если активных blockers нет:

```text
Active contract blockers: none.
```

Если есть:

| ID | Класс | Какой ответ нужен | Что блокирует | Owner / источник |
| --- | --- | --- | --- | --- |
| `<ID>` | `<product blocker / implementation choice>` | `<...>` | `<...>` | `<...>` |

Правила:

- resolved Q не остаётся active blocker;
- future scope не блокирует текущий contract;
- I-* указывать только если он реально должен быть выбран до implementation / DoD;
- internal library choice, не меняющий HTTP contract, не должен делать внешний contract `Blocked`.

# 18. Verification plan

До реализации определить применимые проверки.

## API

- method / path;
- request validation;
- success status;
- response DTO;
- errors;
- auth / role;
- ownership / relation;
- empty collection;
- sorting;
- date/time boundaries.

## OpenAPI

После реализации проверить:

- route присутствует;
- request schema соответствует contract;
- response schema соответствует contract;
- error responses не противоречат contract;
- required / nullable semantics совпадают.

Runtime OpenAPI должен **соответствовать** approved contract, а не переопределять его.

## Integration

Если endpoint имеет Frontend consumer, проверить реальный HTTP exchange:

- Backend origin / `/api/v1`;
- Bearer header;
- DTO;
- ErrorDTO;
- human-readable references;
- time roundtrip;
- empty / error / success.

Mock-only проверка не считается финальным integration evidence.

## QA boundaries

Указать конкретные BR / AC cases.

Для time-sensitive endpoint использовать controlled / frozen `now`, если это нужно для воспроизводимости.

# 19. Approval / implementation status

Не смешивать specification approval и implementation evidence.

## Specification

- Backend agreement:
- Frontend agreement:
- Product Owner agreement, если меняется product behavior:
- status: `Draft / Blocked / Approved / Superseded`

## Implementation

Заполняется после реализации:

- branch / commit / PR:
- runtime OpenAPI checked:
- API tests:
- Integration:
- QA:
- known deviations:

Если implementation расходится с Approved contract без согласованного change — это defect / unsynchronized change, а не новая версия contract «по факту».
