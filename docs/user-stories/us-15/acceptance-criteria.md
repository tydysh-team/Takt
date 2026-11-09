# US-15 — Acceptance Criteria

**User Story:** Возврат работы на доработку

**Story Points:** 12 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-15.01 — Возврат на доработку

**Given:** Teacher имеет доступ к актуальной `submitted` попытке.

**When:** Вводит содержательный комментарий и подтверждает возврат.

**Then:** Решение сохраняется, Homework становится `needs_revision`.


## AC-15.02 — Обязательный комментарий

**Given:** Teacher не ввёл комментарий либо ввёл только пробелы.

**When:** Пытается вернуть работу.

**Then:** Операция отклоняется; Homework остаётся `submitted`.


## AC-15.03 — Ownership revision

**Given:** Teacher пытается вернуть чужую submission.

**When:** Отправляет запрос.

**Then:** Backend запрещает действие и не меняет состояние.


## AC-15.04 — Только актуальная attempt

**Given:** Teacher выбирает историческую/неактуальную попытку.

**When:** Пытается вернуть её.

**Then:** Backend отклоняет действие как конфликт lifecycle.


## AC-15.05 — Сохранность истории

**Given:** Работа возвращена.

**When:** Позже создаётся новая attempt.

**Then:** Предыдущая submission и комментарий Teacher остаются в истории.


## AC-15.06 — Видимость Student

**Given:** Возврат успешно сохранён.

**When:** Student открывает Homework.

**Then:** Видит `needs_revision` и комментарий, объясняющий требуемую доработку.


## AC-15.07 — Удаление из pending queue

**Given:** Возврат выполнен.

**When:** Teacher обновляет очередь.

**Then:** Элемент исчезает до повторной отправки Student.


## AC-15.08 — Double action protection

**Given:** Teacher дважды подтверждает возврат.

**When:** Запрос повторяется.

**Then:** Не создаются дублирующие решения и состояние остаётся корректным.


## AC-15.09 — Atomic failure

**Given:** Backend/transport ошибка во время возврата.

**When:** Запрос не подтверждён.

**Then:** Homework не меняет состояние; UI не показывает ложный success.


## AC-15.10 — Concurrent state change

**Given:** Submission уже reviewed/изменена в другой вкладке.

**When:** Teacher подтверждает revision.

**Then:** Backend возвращает конфликт и не перезаписывает новое состояние.


---

## Coverage checklist

- happy path / основной пользовательский сценарий;
- authentication / authorization / ownership;
- field и business validation;
- lifecycle/status transitions;
- negative/error states;
- loading/empty/error UI states там, где применимо;
- timezone/date boundaries там, где применимо;
- concurrency/idempotency там, где применимо;
- Backend/Frontend contract consistency;
- data integrity/history/statistics consistency;
- performance/observability — в пределах применимости User Story.
