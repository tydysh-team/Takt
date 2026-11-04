# US-20 — Acceptance Criteria

**User Story:** Сводный показатель прогресса

**Story Points:** 14 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-20.01 — Сводка из объяснимых блоков

**Given:** Teacher имеет доступ к Student.

**When:** Открывает progress summary.

**Then:** Получает отдельные attendance, homework и reviews блоки без скрытого интегрального score.


## AC-20.02 — Authorization progress

**Given:** Teacher запрашивает недоступного Student.

**When:** Backend получает request.

**Then:** Progress data не раскрывается.


## AC-20.03 — Attendance block consistency

**Given:** Есть данные US-18.

**When:** Summary строится.

**Then:** Attendance-показатели совпадают с правилами и источниками US-18 за тот же период.


## AC-20.04 — Homework block consistency

**Given:** Есть данные US-19.

**When:** Summary строится.

**Then:** Homework-показатели совпадают с US-19 за тот же период.


## AC-20.05 — Review metrics

**Given:** Есть числовые финальные оценки.

**When:** Summary строится.

**Then:** Агрегируются только реально оценённые работы; отсутствие оценки не превращается в 0.


## AC-20.06 — Partial data resilience

**Given:** Один из блоков не имеет данных.

**When:** Summary открывается.

**Then:** Остальные блоки отображаются корректно; пустой блок представлен как N/A/empty.


## AC-20.07 — Comparison comparable periods

**Given:** UI показывает динамику.

**When:** Есть текущий и предыдущий сопоставимый период.

**Then:** Формула сравнения одинакова Backend/UI и использует сопоставимые диапазоны.


## AC-20.08 — No baseline semantics

**Given:** Для предыдущего периода нет данных.

**When:** UI показывает comparison.

**Then:** Не создаются искусственные +100%/-100%; показывается отсутствие базы сравнения.


## AC-20.09 — Drill-down explainability

**Given:** Teacher кликает по показателю.

**When:** Переходит к исходной истории.

**Then:** Пользователь может проверить источник метрики через Lesson/Homework/review данные.


## AC-20.10 — Error/performance

**Given:** Агрегат не может быть рассчитан либо запрос медленный.

**When:** UI получает состояние.

**Then:** Ошибка не маскируется правдоподобными нулями; endpoint соответствует согласованному Sprint 3 performance-ориентиру.


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
