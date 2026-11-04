# Sprint 3 — API conventions

## Назначение

Этот файл фиксирует единые контрактные правила документации Sprint 3. Перед merge конкретные route/DTO необходимо сверить с фактической реализацией Backend.

## Базовые правила

- API prefix: `/api/v1`.
- Формат данных: JSON, поля в `snake_case`.
- Аутентификация: bearer authentication; пользователь определяется сервером из auth context.
- Идентификаторы владельца (`teacher_id`, `student_id`) нельзя доверенно принимать от клиента там, где владелец выводится из auth context.
- Timestamps должны быть timezone-aware и передаваться в ISO 8601.
- Ошибки должны быть машинно различимы и не маскироваться под успешный `200`.

Рекомендуемый envelope:

```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "Human readable message",
    "details": []
  }
}
```

## HTTP semantics

- `401` — отсутствует/недействительна аутентификация.
- `403` — пользователь аутентифицирован, но действие запрещено.
- `404` — ресурс отсутствует либо намеренно скрыт правилами доступа.
- `409` — конфликт lifecycle/concurrent state.
- `422` — request не прошёл бизнес-/field-validation.

## Конкурентность и повторные запросы

Для mutating операций Backend должен исключать двойное применение одного логического действия при double-click/network retry. Конкретный механизм (idempotency key, optimistic locking, transaction constraint и т.п.) является техническим решением.

## Frontend states

Для list/detail экранов различаются как минимум `loading`, `empty`, `error`, `success`. Для mutating операций — `idle`, `submitting`, `success`, `validation/API error`.

## Производительность

Значения ниже — ориентиры Sprint 3 для локальной/тестовой среды, а не production SLA:

- обычный интерактивный API: p95 ориентир ≤ 500 мс;
- агрегирующие endpoints статистики: p95 ориентир ≤ 1000 мс на типовом учебном объёме данных.
