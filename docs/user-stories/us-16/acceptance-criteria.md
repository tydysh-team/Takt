# US-16 — Acceptance Criteria

**User Story:** Повторная отправка работы

**Story Points:** 12 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-16.01 — Повторная отправка после revision

**Given:** Homework Student находится в `needs_revision`.

**When:** Student отправляет исправленную работу.

**Then:** Создаётся новая attempt, Homework становится `submitted`.


## AC-16.02 — Последовательный attempt_no

**Given:** Существует предыдущая attempt N.

**When:** Resubmit успешен.

**Then:** Новая attempt получает `attempt_no = N + 1` без пропуска/дублирования при нормальном сценарии.


## AC-16.03 — Сохранность предыдущей попытки

**Given:** Student создаёт новую attempt.

**When:** История открывается позже.

**Then:** Предыдущая attempt и решение Teacher не изменены и не удалены.


## AC-16.04 — Только из needs_revision

**Given:** Homework имеет `assigned`, `submitted` или `reviewed`.

**When:** Student пытается выполнить resubmit.

**Then:** Backend отклоняет действие как недопустимый transition.


## AC-16.05 — Ownership resubmit

**Given:** Student указывает чужой Homework.

**When:** Пытается пересдать.

**Then:** Backend отклоняет запрос без создания attempt.


## AC-16.06 — Новый submitted_at

**Given:** Resubmit успешен.

**When:** Backend создаёт новую attempt.

**Then:** Фиксируется новый server-side timezone-aware `submitted_at`.


## AC-16.07 — Late на новой попытке

**Given:** Resubmit происходит после due_at.

**When:** Backend создаёт attempt.

**Then:** Новая attempt получает корректный late-признак; исторические признаки не переписываются.


## AC-16.08 — Concurrency/double click

**Given:** Два запроса resubmit идут параллельно.

**When:** Backend обрабатывает их.

**Then:** Создаётся не более одной новой актуальной attempt одного номера.


## AC-16.09 — Возврат в pending queue

**Given:** Resubmit успешен.

**When:** Teacher обновляет очередь.

**Then:** Новая актуальная attempt снова появляется в pending queue.


## AC-16.10 — Atomic error handling

**Given:** Ошибка upload/Backend происходит в процессе.

**When:** Операция не подтверждена.

**Then:** Старое состояние/история сохраняются; ложная новая attempt не показывается как успешная.


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
