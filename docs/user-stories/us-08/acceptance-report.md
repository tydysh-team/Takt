# Acceptance Report — US-08

## User Story

**US-08 — Учёт посещаемости**

**Я как преподаватель хочу отмечать факт посещения занятия учеником, чтобы сохранять историю проведённых занятий.**

---

## 1. Статус Product Acceptance

**🟡 BLOCKED**

Реализация US-08 ещё не передана на QA / Product Acceptance.

Проверка Acceptance Criteria будет выполнена после завершения:

`Development → Code Review → Integration → QA`

---

## 2. Проверяемая версия

**Branch / PR:** [будет указано перед началом проверки]  
**Commit:** [будет указано перед началом проверки]  
**Дата проверки:** [не выполнено]

---

## 3. Результаты Acceptance Criteria

| Acceptance Criterion | Статус | Комментарий |
| --- | --- | --- |
| AC-US08-01 — Первоначальное состояние без отметки | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-02 — Установка Present | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-03 — Установка Absent | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-04 — Present → Absent | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-05 — Absent → Present | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-06 — Attendance только для собственного Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-07 — Связь с конкретным Student и Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-08 — Будущий Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-09 — Точная граница начала занятия | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-10 — In Progress Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-11 — Completed Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-12 — Cancelled Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-13 — Перенесённый Lesson до нового времени | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-14 — Перенесённый Lesson после нового времени | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-15 — Чужой / недоступный Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-16 — Отсутствующий Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-17 — Недопустимое attendance-значение | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-18 — Backend / API error | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-19 — Loading / защита от повторной отправки | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-20 — Повторное открытие Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-21 — Persistence after refresh | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-22 — Неизвестное attendance-значение | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-23 — Authentication / Authorization | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-24 — Реальный Frontend ↔ Backend E2E | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-25 — Ошибка не создаёт ложного UI-state | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US08-26 — Regression связанных сценариев | 🟡 BLOCKED | Реализация не передана на проверку |

---

## 4. Defects

На текущем этапе дефекты не зафиксированы, так как QA / Product Acceptance ещё не выполнялись.

После обнаружения дефекта фиксируются:

- идентификатор дефекта;
- связанный Acceptance Criterion;
- фактическое поведение;
- ожидаемое поведение;
- ссылка на bug-card / PR;
- результат retest.

---

## 5. Evidence

Evidence будет добавлено в:

`docs/user-stories/us-08/evidence/`

В качестве evidence могут использоваться:

- screenshots;
- browser-flow;
- API responses;
- результаты автоматических тестов;
- логи;
- подтверждения boundary cases;
- другие подтверждения выполнения Acceptance Criteria.

---

## 6. Retest

Retest выполняется для Acceptance Criteria, затронутых исправлением дефекта.

При необходимости проводится regression связанных сценариев `US-01–US-07`.

Результаты retest фиксируются в этом отчёте.

---

## 7. Итог

US-08 остаётся в статусе:

**🟡 BLOCKED**

Причина: реализация ещё не готова к Product Acceptance.

После передачи интегрированной версии будут выполнены:

- QA checklist;
- проверка `not_set / present / absent`;
- проверка изменения ранее установленной отметки;
- проверка future / in-progress / completed / cancelled Lesson;
- отдельная проверка перенесённого Lesson по актуальным новым временным данным;
- проверка, что признак переноса не заменяет lifecycle-status;
- проверка ownership и authorization;
- persistence after refresh;
- Frontend ↔ Backend E2E;
- regression связанных сценариев;
- фиксация defects;
- retest;
- определение итогового статуса `PASS / FAIL / BLOCKED`.
