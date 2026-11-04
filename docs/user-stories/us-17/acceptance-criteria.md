# US-17 — Acceptance Criteria

**User Story:** История попыток сдачи

**Story Points:** 14 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-17.01 — Полная история attempts

**Given:** Teacher имеет доступ к Homework.

**When:** Открывает историю.

**Then:** Backend возвращает все attempts этого Homework, доступные по правилам хранения.


## AC-17.02 — Стабильный порядок

**Given:** У Homework несколько attempts.

**When:** История загружается.

**Then:** Порядок детерминирован и согласован с `attempt_no`/submitted_at.


## AC-17.03 — Данные каждой попытки

**Given:** Attempt отображается.

**When:** Teacher раскрывает её.

**Then:** Видны attempt_no, submitted_at, Student comment/files, late и review result этой attempt.


## AC-17.04 — Review не смешивается между attempts

**Given:** У разных attempts разные решения.

**When:** История отображается.

**Then:** Каждая attempt показывает только собственный review/comment Teacher.


## AC-17.05 — Актуальная попытка различима

**Given:** У Homework есть исторические и текущая attempt.

**When:** UI показывает историю.

**Then:** Текущая attempt визуально/семантически отличима от исторических.


## AC-17.06 — Ownership history

**Given:** Teacher запрашивает Homework другого Teacher.

**When:** Backend получает request.

**Then:** История не раскрывается.


## AC-17.07 — 0 attempts empty state

**Given:** Homework ещё не сдавалось.

**When:** Teacher открывает историю.

**Then:** Показывается корректный empty state, не error.


## AC-17.08 — Loading/error различимы

**Given:** Запрос истории выполняется/ошибается.

**When:** UI рендерит состояние.

**Then:** Loading и API error не маскируются под отсутствие attempts.


## AC-17.09 — Недоступное вложение

**Given:** Исторический файл отсутствует/недоступен по storage policy.

**When:** Teacher открывает attempt.

**Then:** UI обрабатывает недоступность файла без падения всей истории.


## AC-17.10 — Неизменяемость истории после resubmit

**Given:** Создана новая attempt.

**When:** История загружается снова.

**Then:** Старые attempts остаются неизменными, новая добавлена отдельной записью.


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
