# US-21 — Acceptance Criteria

**User Story:** Статистика ученика

**Story Points:** 16 (без изменения оценки команды)

## Статус

**🟡 BLOCKED — реализация ещё не передана на QA / Product Acceptance.**

Критерии ниже являются проверяемым контрактом. Фактические результаты фиксируются только после `Development → Code Review → Integration → QA`.

---

## AC-21.01 — Student видит только собственный progress

**Given:** Student аутентифицирован.

**When:** Открывает «Мой прогресс».

**Then:** Backend строит данные по current Student без произвольного student_id.


## AC-21.02 — Privacy других Students

**Given:** Student пытается подменить id/route.

**When:** Backend получает запрос.

**Then:** Данные другого Student не раскрываются.


## AC-21.03 — Согласованность Teacher/Student facts

**Given:** Teacher и Student смотрят один Student и период.

**When:** Сравниваются общие фактические метрики.

**Then:** Числа по общим фактам совпадают при одинаковых исходных данных.


## AC-21.04 — Нет внутренних Teacher данных

**Given:** Student получает progress response.

**When:** UI отображает статистику.

**Then:** В response отсутствуют внутренние заметки/служебные поля Teacher, не предназначенные Student.


## AC-21.05 — Период прозрачен

**Given:** Student открывает/меняет период.

**When:** Метрики обновляются.

**Then:** UI ясно показывает период, Backend применяет те же правила границ/timezone.


## AC-21.06 — Частично отсутствующие данные

**Given:** Есть только Lesson или только Homework.

**When:** Страница открывается.

**Then:** Доступный блок отображается, отсутствие другого не ломает страницу.


## AC-21.07 — Непроверенные Homework

**Given:** Часть Homework ещё `submitted`/`needs_revision`.

**When:** Student смотрит статистику.

**Then:** Неоценённые работы не превращаются в нулевые оценки и корректно влияют только на релевантные counts.


## AC-21.08 — Несколько Teachers

**Given:** Student связан с несколькими Teachers.

**When:** Progress агрегируется/детализируется.

**Then:** Источники данных остаются однозначными, чужие Student-данные не смешиваются.


## AC-21.09 — Empty/loading/error

**Given:** Новый Student не имеет данных либо API грузится/ошибается.

**When:** UI рендерит состояние.

**Then:** Empty, loading и error различимы; ошибка не выглядит как нулевой прогресс.


## AC-21.10 — Drill-down к собственным данным

**Given:** Student выбирает связанный блок/метрику.

**When:** Переходит к Homework/занятиям.

**Then:** Открываются только собственные исходные данные, объясняющие показатель.


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
