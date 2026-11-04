# US-19 — Acceptance Criteria

**User Story:** Статистика выполнения домашних заданий

**Story Points:** 16 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-19.01 — Assigned count

**Given:** Teacher имеет доступ к Student и периоду.

**When:** Запрашивает Homework statistics.

**Then:** `assigned` соответствует количеству Homework, попадающих в период по единому правилу.


## AC-19.02 — Submitted/reviewed counts

**Given:** В периоде есть Homework разных состояний.

**When:** Статистика строится.

**Then:** Counts воспроизводимы по исходным Homework/submissions и не считают attempts как отдельные Homework.


## AC-19.03 — Late count/rate

**Given:** Есть Homework со сдачами до/после deadline.

**When:** Агрегат строится.

**Then:** Late определяется по согласованному правилу и использует фактическую сдачу без двойного счёта.


## AC-19.04 — Revision required

**Given:** Некоторые Homework возвращались на доработку.

**When:** Статистика строится.

**Then:** Метрика revision_required считает Homework по согласованной семантике, а не число кликов/review записей.


## AC-19.05 — Completion rate formula

**Given:** assigned > 0.

**When:** Рассчитывается completion rate.

**Then:** Используется единая документированная формула `completed_assignments / assigned_assignments * 100`.


## AC-19.06 — Zero denominator

**Given:** assigned = 0.

**When:** Процент рассчитывается.

**Then:** Возвращается `null`/N/A, а не NaN/exception или вводящий в заблуждение 0%.


## AC-19.07 — Period boundaries

**Given:** Homework расположен на границе периода.

**When:** Teacher меняет period.

**Then:** Backend применяет одно и то же правило включения date_from/date_to во всех метриках.


## AC-19.08 — Authorization

**Given:** Teacher запрашивает недоступного Student.

**When:** Backend получает request.

**Then:** Статистика не раскрывается.


## AC-19.09 — Drill-down consistency

**Given:** Teacher переходит из метрики к исходным Homework.

**When:** Открывается соответствующий список.

**Then:** Исходные объекты объясняют агрегат; расхождение возможно только по явно показанному фильтру.


## AC-19.10 — Empty/error/performance

**Given:** Нет Homework либо агрегирующий API ошибся/нагружен.

**When:** UI получает состояние.

**Then:** Empty, error и loading различимы; endpoint соответствует Sprint 3 performance-ориентиру на типовом объёме.


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
