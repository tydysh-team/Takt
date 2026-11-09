# US-18 — Acceptance Criteria

**User Story:** История занятий и посещаемости

**Story Points:** 16 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-18.01 — Доступная история Lesson

**Given:** Teacher связан со Student.

**When:** Запрашивает lesson history за период.

**Then:** Backend возвращает занятия этого Student в доступном Teacher-контексте.


## AC-18.02 — Authorization Student

**Given:** Teacher запрашивает недоступного Student.

**When:** Backend получает request.

**Then:** Данные занятий/attendance не раскрываются.


## AC-18.03 — Поля строки истории

**Given:** Lesson входит в период.

**When:** UI показывает запись.

**Then:** Видны дата/время, название/предмет, lifecycle-status и attendance при наличии.


## AC-18.04 — Attendance not_set ≠ absent

**Given:** Completed Lesson не имеет отметки attendance.

**When:** Статистика считается.

**Then:** Такой Lesson учитывается отдельно как неотмеченный, не как отсутствие.


## AC-18.05 — Cancelled не искажает attendance

**Given:** Lesson отменён.

**When:** Агрегат посещаемости рассчитывается.

**Then:** Cancelled Lesson не считается посещённым и не входит в знаменатель attendance rate.


## AC-18.06 — Один Lesson один раз

**Given:** В источниках/joins есть связанные записи.

**When:** История агрегируется.

**Then:** Один Lesson не дублируется и не увеличивает counts несколько раз.


## AC-18.07 — Границы периода/timezone

**Given:** Lesson лежит на границе date_from/date_to.

**When:** Запрос выполняется.

**Then:** Backend и Frontend одинаково трактуют границы и timezone.


## AC-18.08 — Согласованность list и aggregates

**Given:** История загружена.

**When:** UI показывает summary.

**Then:** Counts/attendance соответствуют тем же строкам истории за тот же период.


## AC-18.09 — Empty/error semantics

**Given:** В периоде нет Lesson либо API ошибся.

**When:** UI получает ответ.

**Then:** Empty state отличается от ошибки и не выдаёт ошибку за «0 занятий».


## AC-18.10 — Производительность агрегата

**Given:** У Student типовой учебный объём истории.

**When:** Teacher запрашивает период.

**Then:** Endpoint укладывается в согласованный Sprint 3 performance-ориентир без N+1-эффекта, заметного пользователю.


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
