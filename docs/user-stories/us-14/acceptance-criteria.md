# US-14 — Acceptance Criteria

**User Story:** Оценка и комментарий к работе

**Story Points:** 12 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-14.01 — Review актуальной submission

**Given:** Teacher имеет доступ к актуальной `submitted` попытке.

**When:** Сохраняет валидную оценку/комментарий.

**Then:** Review сохраняется для этой attempt, Homework становится `reviewed`.


## AC-14.02 — Ownership review

**Given:** Teacher пытается оценить чужую попытку.

**When:** Отправляет review.

**Then:** Backend отклоняет запрос без изменения данных.


## AC-14.03 — Точная привязка review к attempt

**Given:** У Homework несколько attempts.

**When:** Teacher оценивает текущую.

**Then:** Результат проверки относится именно к выбранной попытке и не переносится на предыдущие.


## AC-14.04 — Валидация grade

**Given:** Teacher вводит значение вне согласованной шкалы.

**When:** Сохраняет review.

**Then:** Backend/Frontend отклоняют значение согласованно; состояние Homework не меняется.


## AC-14.05 — Комментарий по правилам поля

**Given:** Teacher вводит допустимый комментарий либо оставляет пустым, если это разрешено контрактом.

**When:** Сохраняет review.

**Then:** Поведение соответствует единой validation-модели Backend/Frontend.


## AC-14.06 — Один актуальный review result

**Given:** Teacher повторяет сохранение одного review.

**When:** Backend обрабатывает повтор.

**Then:** Не создаются несколько независимых актуальных review results для одной attempt.


## AC-14.07 — Удаление из pending queue

**Given:** Review успешно сохранён.

**When:** Teacher возвращается в очередь.

**Then:** Работа больше не отображается как ожидающая проверки.


## AC-14.08 — Видимость Student

**Given:** Review успешно сохранён.

**When:** Student открывает Homework.

**Then:** Student видит подтверждённую оценку/комментарий только после успешного Backend save.


## AC-14.09 — Atomic failure

**Given:** Backend не смог сохранить review.

**When:** Операция завершается ошибкой.

**Then:** Homework остаётся `submitted`, UI не показывает ложный `reviewed`/оценку.


## AC-14.10 — Concurrent conflict

**Given:** Submission уже обработана в другой сессии.

**When:** Teacher пытается сохранить review.

**Then:** Backend возвращает conflict; существующий результат не перезаписывается молча.


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
