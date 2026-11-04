# US-10 — Acceptance Criteria

**User Story:** Назначение домашнего задания

**Story Points:** 12 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-10.01 — Создание Homework авторизованным Teacher

**Given:** Teacher аутентифицирован и Student доступен ему.

**When:** Teacher отправляет валидные данные Homework.

**Then:** Backend создаёт ровно одно Homework со статусом `assigned` и возвращает созданный объект.


## AC-10.02 — Backend authorization Teacher → Student

**Given:** Teacher аутентифицирован, но Student не входит в его доступный контекст.

**When:** Teacher пытается назначить Homework.

**Then:** Backend отклоняет запрос; Homework не создаётся.


## AC-10.03 — Валидация обязательных полей

**Given:** Форма создания открыта.

**When:** `student_id`, `title` или обязательный `due_at` отсутствует/некорректен.

**Then:** Создание отклоняется с validation error, без частично созданного Homework.


## AC-10.04 — Timezone-aware deadline

**Given:** Teacher задаёт срок выполнения.

**When:** Запрос отправляется Backend.

**Then:** `due_at` сохраняется и возвращается как timezone-aware timestamp без неоднозначного локального времени.


## AC-10.05 — Опциональные описание и материалы

**Given:** Teacher создаёт Homework без description и/или вложений.

**When:** Запрос валиден по обязательным полям.

**Then:** Homework создаётся; отсутствие опциональных данных не считается ошибкой.


## AC-10.06 — Атомарность сохранения

**Given:** В процессе создания происходит ошибка обязательной части сохранения/загрузки.

**When:** Backend не может завершить операцию.

**Then:** Система не оставляет частично созданный объект, выдаваемый за успешное Homework.


## AC-10.07 — Защита от double submit

**Given:** Teacher дважды нажимает submit/клиент повторяет запрос.

**When:** Первый запрос уже обрабатывается.

**Then:** Одно логическое действие не приводит к двум одинаковым Homework.


## AC-10.08 — Видимость задания Student

**Given:** Homework успешно создан.

**When:** Соответствующий Student загружает собственные задания.

**Then:** Новое Homework доступно этому Student и не доступно другим Students.


## AC-10.09 — Корректные error states

**Given:** Backend/transport возвращает ошибку.

**When:** Frontend получает неуспешный ответ.

**Then:** UI не показывает ложный success и позволяет пользователю понять, что Homework не подтверждено Backend.


## AC-10.10 — Контракт ответа

**Given:** Создание успешно.

**When:** Backend возвращает response.

**Then:** Response содержит идентификатор, Student context, title, due_at и актуальный lifecycle-status, достаточные для обновления UI.


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
