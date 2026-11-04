# US-12 — Acceptance Criteria

**User Story:** Отправка выполненного задания

**Story Points:** 14 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-12.01 — Первая отправка собственного Homework

**Given:** Student аутентифицирован, Homework принадлежит ему и имеет `assigned`.

**When:** Student отправляет валидную работу.

**Then:** Создаётся Submission Attempt №1, Homework становится `submitted`.


## AC-12.02 — Ownership проверки

**Given:** Student указывает чужой Homework.

**When:** Отправляет submission.

**Then:** Backend отклоняет действие и не создаёт attempt.


## AC-12.03 — Server-side submitted_at

**Given:** Валидная первая отправка.

**When:** Backend создаёт attempt.

**Then:** `submitted_at` определяется Backend и возвращается timezone-aware.


## AC-12.04 — Late calculation

**Given:** Submission создаётся до/после `due_at`.

**When:** Backend фиксирует attempt.

**Then:** Late-признак корректно соответствует фактическому `submitted_at` и не меняет lifecycle сам по себе.


## AC-12.05 — Историческая неизменяемость

**Given:** Attempt №1 успешно создан.

**When:** Student повторно открывает Homework.

**Then:** Созданная попытка существует отдельно и не заменяется черновым/локальным состоянием.


## AC-12.06 — Запрет повторной первичной сдачи

**Given:** Homework уже `submitted`.

**When:** Student повторяет первичную отправку.

**Then:** Новая активная попытка не создаётся; возвращается конфликт состояния.


## AC-12.07 — Double-click/network retry

**Given:** Один submit отправлен повторно почти одновременно.

**When:** Backend обрабатывает конкурентные запросы.

**Then:** Не возникает двух attempts с `attempt_no = 1`.


## AC-12.08 — Atomic upload/save

**Given:** Во время сохранения submission возникает ошибка файла/Backend.

**When:** Операция не завершена.

**Then:** UI не показывает success; Backend не оставляет ложную активную успешную попытку.


## AC-12.09 — Попадание в очередь Teacher

**Given:** Первая отправка успешно завершена.

**When:** Teacher обновляет pending queue.

**Then:** Актуальная попытка появляется в очереди соответствующего Teacher.


## AC-12.10 — Корректный response

**Given:** Отправка успешна.

**When:** Backend возвращает ответ.

**Then:** Response содержит attempt id/no, submitted_at, late-признак и актуальный Homework status.


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
