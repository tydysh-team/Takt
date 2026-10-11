# Единая модель ошибок

[К API](conventions.md) · [Authentication](authentication.md) · [Контракты Sprint 1](contracts/sprint-01.md) · [Интеграция](../architecture/integration.md) · [BR](../requirements/business-rules.md)

## Назначение

Все ошибки прикладного Backend API Sprint 1 используют единую публичную структуру.

Framework-specific error shape FastAPI / Pydantic не является внешним контрактом проекта.

Frontend принимает решения по HTTP status и стабильному `error.code`, а не по тексту `message`.

## ErrorDTO

Формат ответа:

```json
{
  "error": {
    "code": "student_not_available",
    "message": "Student is not available for the current teacher.",
    "details": []
  }
}
```

Поля обязательны:

| Поле | Тип | Семантика |
| --- | --- | --- |
| `error` | object | Корневой объект проектной ошибки |
| `error.code` | string | Стабильный machine-readable код в `snake_case` |
| `error.message` | string | Безопасный человекочитаемый текст; не является контрактом для branching |
| `error.details` | array | Детали ошибки; при отсутствии деталей передаётся `[]` |

Элемент `details`:

| Поле | Тип | Семантика |
| --- | --- | --- |
| `location` | array[string \| integer] | Путь до проблемного значения, начиная с `body`, `query`, `path` или другого согласованного transport location |
| `code` | string | Стабильный проектный код конкретной причины |
| `message` | string | Безопасное описание причины |

В ErrorDTO не возвращаются:

- исходный password;
- Bearer token;
- password hash;
- SQL;
- database constraint names;
- stack trace;
- полное exception representation;
- framework `input` / `ctx`;
- другие внутренние диагностические данные.

## Request validation — `422 validation_error`

Некорректная request schema возвращает:

- HTTP `422`;
- `error.code = "validation_error"`;
- одну или несколько записей `details`.

Пример:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [
      {
        "location": ["body", "starts_at"],
        "code": "invalid_datetime",
        "message": "An ISO 8601 date-time with timezone is required."
      }
    ]
  }
}
```

Проектный набор `details[].code` Sprint 1:

| code | Когда используется |
| --- | --- |
| `required` | Обязательное значение отсутствует |
| `invalid_type` | Значение имеет неверный JSON / DTO type |
| `invalid_uuid` | Значение не является допустимым UUID |
| `invalid_datetime` | Date-time имеет неверный формат либо не содержит timezone |
| `invalid_email` | Значение не соответствует формату email |
| `too_short` | Строковое значение короче установленной минимальной длины |
| `too_long` | Строковое значение длиннее установленной максимальной длины |
| `unexpected_field` | Передано необъявленное body-поле |
| `invalid_json` | Request body не является корректным JSON |
| `invalid_value` | Значение имеет корректный базовый тип, но не входит в допустимый набор либо нарушает transport-level ограничение, для которого нет более точного project code |

Backend преобразует framework validation errors в этот набор. Pydantic error types не становятся публичным стабильным API.

Примеры BR-10:

- некорректный формат `email` → `422 validation_error` + `invalid_email`;
- `password` короче 8 символов → `422 validation_error` + `too_short`;
- `password` длиннее 128 символов → `422 validation_error` + `too_long`;
- `role`, отличный от `teacher` / `student` → `422 validation_error` + `invalid_value`;
- `display_name`, который после trim становится пустым → `422 validation_error` + `invalid_value`.

## Реестр ошибок Sprint 1

| `error.code` | HTTP | Условие |
| --- | ---: | --- |
| `validation_error` | `422` | Request не соответствует объявленной schema / transport-level ограничениям |
| `invalid_date_range` | `400` | `from` и `to` валидны как date-time, но выполняется `from >= to` |
| `lesson_start_in_past` | `400` | При создании Lesson валидный `starts_at` удовлетворяет `starts_at < now` |
| `authentication_required` | `401` | Bearer credential отсутствует, невалиден или истёк |
| `invalid_credentials` | `401` | Login с неизвестным email либо неверным password |
| `forbidden` | `403` | Account аутентифицирован, но роль / операция не разрешена |
| `student_not_available` | `404` | Student не существует либо не связан с текущим Teacher |
| `not_found` | `404` | Запрошенный ресурс / route не найден и нет более специфичного project code |
| `method_not_allowed` | `405` | HTTP method не поддерживается данным route |
| `email_already_registered` | `409` | Регистрация использует email, уже занятый после нормализации |
| `internal_error` | `500` | Неожиданная server-side ошибка |

Этот реестр является общим источником допустимых Sprint 1 error codes. Конкретный endpoint перечисляет только применимые ему коды в своём API-контракте.

Новый ожидаемый error code не вводится локально в реализации без обновления этого реестра и соответствующего API-контракта.

## Семантика отдельных ошибок

### `email_already_registered`

Регистрация нормализует email по BR-10 через trim + lowercase.

Если после нормализации Account с таким email уже существует, операция отклоняется:

- HTTP `409`;
- `error.code = "email_already_registered"`.

Та же семантика используется при race condition, если конфликт обнаружен уникальным ограничением БД во время commit.

Backend может преобразовать ожидаемое нарушение известного unique constraint в `email_already_registered`, но не возвращает клиенту имя constraint или текст database exception.

### `lesson_start_in_past`

`starts_at` сначала должен успешно пройти schema / timezone validation.

Если transport корректен, но при выполнении создания выполняется:

`starts_at < now`

операция отклоняется:

- HTTP `400`;
- `error.code = "lesson_start_in_past"`.

`starts_at == now` допускается согласно BR-08.

Отклонённая операция не создаёт Lesson.

### `student_not_available`

Один и тот же публичный ответ используется, если выбранный `student_id`:

- не существует;
- существует, но не связан с текущим Teacher.

Это не позволяет различать отсутствующий и чужой Student через API.

### `authentication_required` и `invalid_credentials`

`authentication_required` относится к защищённому запросу, для которого отсутствует действующий Bearer credential.

`invalid_credentials` относится к операции login.

Неизвестный email и неверный password при login дают одинаковый `401 invalid_credentials`, чтобы login API не раскрывал существование Account разными ответами.

### `forbidden`

`403 forbidden` используется, когда identity уже установлена, но текущая роль или разрешение не допускает операцию.

Frontend не должен трактовать `403` как необходимость автоматического повторного login.

### `internal_error`

Неожиданные persistence errors, programming errors, response validation / serialization failures и другие непредусмотренные server-side exceptions не раскрываются клиенту.

Публичный ответ:

- HTTP `500`;
- `error.code = "internal_error"`;
- безопасный нейтральный `message`;
- `details: []`.

Полная техническая диагностика остаётся только в server-side logging с соблюдением правил безопасности.

## FastAPI / Pydantic mapping

Backend на API-границе приводит применимые framework errors к проектному ErrorDTO.

Минимально должны быть обработаны:

- `RequestValidationError` → `422 validation_error`;
- project / domain exceptions → соответствующие записи реестра;
- authentication / authorization failures → `401` / `403`;
- route not found → `404 not_found`;
- method not allowed → `405 method_not_allowed`;
- unexpected exception → `500 internal_error`.

Response validation / serialization failure является server-side defect и возвращается как `500 internal_error`, а не как клиентская `422`.

Если persistence exception соответствует известному ожидаемому конфликту, Service / API mapping может преобразовать его в конкретную проектную ошибку. Неизвестная database exception не угадывается по тексту для формирования нового business code и рассматривается как `500 internal_error`.

## OpenAPI и API-контракты

Для каждого endpoint [API-контракт Sprint 1](contracts/sprint-01.md) перечисляет:

- успешные HTTP responses;
- применимые error statuses;
- стабильные `error.code`.

Runtime OpenAPI после реализации должен описывать ErrorDTO для объявленных error responses и соответствовать утверждённым контрактам.

Отсутствие кода в OpenAPI не отменяет этот реестр, но расхождение фактического endpoint с его утверждённым контрактом считается дефектом или несогласованным изменением.

## Поведение Frontend

Frontend:

- ветвится по HTTP status и `error.code`;
- не сравнивает `error.message` для бизнес-логики;
- связывает field errors с формой через `details[].location`;
- безопасно обрабатывает неизвестный `error.code` общим сообщением;
- не изобретает Backend ErrorDTO для transport failures.

Сетевой сбой, timeout, CORS failure, non-JSON response и несовместимый response DTO являются локальными transport / compatibility errors API-layer.

Повтор операции после неизвестной ошибки допускается только там, где это безопасно для конкретного сценария; UI не должен предполагать серверную идемпотентность, если она не определена контрактом.

## Проверки

Минимально проверить:

- все API errors имеют одну оболочку `{"error": ...}`;
- `details` присутствует всегда;
- FastAPI / Pydantic validation не протекает наружу в default shape;
- неизвестные body-поля дают `422 validation_error`;
- invalid / naive date-time даёт `422 validation_error`;
- `from >= to` даёт `400 invalid_date_range`;
- `starts_at < now` при создании Lesson даёт `400 lesson_start_in_past`;
- повторный нормализованный email даёт `409 email_already_registered`;
- отсутствующий и чужой Student дают одинаковый `404 student_not_available`;
- protected endpoint без действующего token даёт `401 authentication_required`;
- неверный login даёт `401 invalid_credentials`;
- запрещённая роль даёт `403 forbidden`;
- unsupported method даёт `405 method_not_allowed`;
- response validation failure становится `500 internal_error`;
- stack trace, SQL, secrets и framework internals не попадают в response.
