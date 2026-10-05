# Единая модель ошибок

[К API](conventions.md) · [Интеграция](../architecture/integration.md)

## DTO ошибки

Все ошибки прикладного Backend API используют следующую структуру:

```json
{
  "error": {
    "code": "student_not_available",
    "message": "Student is not available for the current teacher.",
    "details": []
  }
}
```

`error` — обязательный объект; `code` — обязательная стабильная строка в snake_case; `message` — обязательный безопасный текст; `details` — обязательный массив (пустой при отсутствии деталей). Так клиент не проверяет несколько вариантов оболочки.

Каждая деталь: `location` (массив строк / числовых индексов: body/query/path и путь поля), `code` (стабильный проектный код причины), `message` (безопасный текст). Поля входных данных, stack traces, SQL, секреты и полное исключение не включаются в ответ.

Пример field validation, HTTP 422:

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

## Реестр кодов Sprint 1

| code | HTTP | Условие |
| --- | --- | --- |
| `validation_error` | 422 | Некорректная request schema |
| `invalid_date_range` | 400 | Корректные date-time, но `from >= to` |
| `authentication_required` | 401 | Credential отсутствует / невалиден / истёк |
| `invalid_credentials` | 401 | Вход с неверными данными |
| `forbidden` | 403 | Нет требуемой роли / разрешённого доменного контекста |
| `student_not_available` | 404 | Выбранный Student не существует либо не связан с текущим Teacher |
| `not_found` | 404 | Неизвестный ресурс / маршрут |
| `method_not_allowed` | 405 | Метод не поддерживается маршрутом |
| `internal_error` | 500 | Неожиданная ошибка сервера |

409 применяется только после определения конкретного конфликта; код конфликта регистрации зависит от Q-08. Код `student_not_available` одинаков для отсутствующего и чужого Student: ответ не раскрывает принадлежность чужих данных.

Для `validation_error.details[].code` использовать проектный набор: `required`, `invalid_type`, `invalid_uuid`, `invalid_datetime`, `unexpected_field`, `invalid_json`, `invalid_value` (fallback). Не экспортировать Pydantic error types как обещание стабильности проекта.

## Реализация и Frontend

FastAPI позволяет заменить обработчики `RequestValidationError` и HTTP exceptions. Backend переводит входные ошибки в этот DTO, сохраняет 422, а ошибки response validation — в безопасную 500. Поля `loc` / `msg` framework error преобразуются в `location` / `message`; сырой `input`, body и `ctx` не отправляются клиенту. OpenAPI описывает ErrorDTO для объявленных ответов. Источник: [FastAPI — обработка ошибок](https://fastapi.tiangolo.com/tutorial/handling-errors/).

Frontend ветвится по HTTP и стабильному `code`, не по тексту `message`. Field errors привязываются к полям формы через `location`; остальные показываются в контексте операции. При неизвестном code — безопасное общее сообщение и возможность повторить действие, если оно не создаёт риск повторного сохранения.

Сетевой сбой, не-JSON ответ прокси и несовместимый DTO — локальные транспортные ошибки API-layer, не выдуманный ответ Backend. Серверные ошибки логируются с диагностикой безопасно; клиент получает только нейтральный текст. В продакшен-режиме внутренние трассировки не возвращаются.
