# US-13 — Acceptance Criteria

**User Story:** Очередь работ на проверку

**Story Points:** 14 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-13.01 — Очередь только текущего Teacher

**Given:** Teacher аутентифицирован.

**When:** Открывает pending queue.

**Then:** Backend возвращает только актуальные `submitted` attempts его Homework.


## AC-13.02 — Одна актуальная запись на Homework

**Given:** У Homework есть несколько исторических attempts.

**When:** Актуальная попытка находится в `submitted`.

**Then:** В очереди присутствует только актуальная попытка, старые не дублируют элемент.


## AC-13.03 — Данные карточки очереди

**Given:** В очереди есть работа.

**When:** UI отображает элемент.

**Then:** Видны Student, Homework, attempt_no, submitted_at, due_at и late-признак.


## AC-13.04 — Стабильная сортировка

**Given:** В очереди несколько работ.

**When:** Список загружается повторно без изменений.

**Then:** Порядок детерминирован и согласован с API/UI.


## AC-13.05 — Просмотр детали

**Given:** Teacher выбирает элемент очереди.

**When:** Запрашивает submission.

**Then:** Получает данные именно этой попытки, её комментарий и вложения.


## AC-13.06 — Empty/loading/error

**Given:** Очередь пуста, грузится либо API упал.

**When:** UI получает соответствующее состояние.

**Then:** Три состояния визуально и логически различимы.


## AC-13.07 — Foreign submission denied

**Given:** Teacher пытается открыть submission другого Teacher.

**When:** Backend получает id.

**Then:** Доступ отклоняется без раскрытия чужих данных.


## AC-13.08 — Исчезновение после review

**Given:** Актуальная работа принята.

**When:** Teacher обновляет очередь.

**Then:** Проверенная работа больше не присутствует в pending queue.


## AC-13.09 — Исчезновение после revision

**Given:** Актуальная работа возвращена на доработку.

**When:** Teacher обновляет очередь.

**Then:** Работа исчезает до новой пересдачи Student.


## AC-13.10 — Concurrent state change

**Given:** Работа была обработана в другой вкладке между list и action.

**When:** Teacher открывает/изменяет её.

**Then:** Backend отклоняет недопустимое повторное действие, UI сообщает об изменении состояния.


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
