# US-11 — Acceptance Criteria

**User Story:** Просмотр домашних заданий учеником

**Story Points:** 12 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-11.01 — Только собственные Homework

**Given:** Student аутентифицирован.

**When:** Student открывает список Homework.

**Then:** Backend возвращает только Homework текущего Student.


## AC-11.02 — Разделение активных и завершённых

**Given:** У Student есть задания разных состояний.

**When:** Student открывает список/фильтр.

**Then:** UI однозначно отличает задания, требующие действия, ожидающие проверки и завершённые.


## AC-11.03 — Отображение ключевых данных

**Given:** Homework присутствует в списке.

**When:** Карточка отображается.

**Then:** Видны title, Teacher, due_at, lifecycle-status и overdue-признак при наличии.


## AC-11.04 — Просмотр деталей

**Given:** Student выбирает собственное Homework.

**When:** Запрашиваются детали.

**Then:** Отображаются description, materials и доступные данные актуальной попытки/review.


## AC-11.05 — Overdue как вычисляемый признак

**Given:** `due_at` наступил, lifecycle не завершён.

**When:** Student просматривает Homework.

**Then:** UI показывает просроченность, не подменяя lifecycle-status отдельным статусом `overdue`.


## AC-11.06 — Empty state

**Given:** У Student нет Homework в выбранной выборке.

**When:** Загрузка успешно завершена.

**Then:** Показывается empty state, а не loading/error.


## AC-11.07 — Loading и error различимы

**Given:** Запрос ещё выполняется либо завершился ошибкой.

**When:** UI рендерит состояние.

**Then:** Loading/error не отображаются как пустой список.


## AC-11.08 — Чужой homework_id

**Given:** Student пытается открыть Homework другого Student.

**When:** Backend получает запрос детали.

**Then:** Доступ не предоставляется и чужие данные не раскрываются.


## AC-11.09 — Устойчивость к неизвестному status

**Given:** Backend/данные содержат неизвестное значение статуса.

**When:** Frontend получает объект.

**Then:** Интерфейс не падает и показывает безопасный fallback/ошибку совместимости.


## AC-11.10 — Актуализация после изменений

**Given:** Homework был отправлен/проверен в другой операции.

**When:** Student повторно загружает список/деталь.

**Then:** UI отражает подтверждённое Backend-состояние без устаревшей локальной подмены.


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
