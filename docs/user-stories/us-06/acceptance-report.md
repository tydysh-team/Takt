# Acceptance Report — US-06

## User Story

**US-06 — Отмена занятия**

**Я как преподаватель хочу отменить занятие, чтобы ученик видел, что оно больше не состоится.**

---

## 1. Статус Product Acceptance

**🟡 BLOCKED**

Реализация US-06 ещё не передана на QA / Product Acceptance.

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
| AC-US06-01 — Успешная отмена собственного Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-02 — Обязательное подтверждение | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-03 — Отказ пользователя от отмены | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-04 — Отсутствие hard delete | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-05 — Cancelled-state для Teacher | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-06 — Cancelled-state для Student | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-07 — Отмена только собственного Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-08 — Чужой Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-09 — Отсутствующий Lesson | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-10 — Повторная отмена | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-11 — Backend / API error | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-12 — Loading / защита от повторной операции | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-13 — Сохранение состояния после refresh | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-14 — Authentication / Authorization | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-15 — Реальный Frontend ↔ Backend flow | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-16 — Cancel / Error не создают ложного состояния | 🟡 BLOCKED | Реализация не передана на проверку |
| AC-US06-17 — Regression связанных сценариев | 🟡 BLOCKED | Реализация не передана на проверку |

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

`docs/user-stories/us-06/evidence/`

В качестве evidence могут использоваться:

- screenshots;
- browser-flow;
- API responses;
- результаты автоматических тестов;
- логи;
- другие подтверждения выполнения Acceptance Criteria.

---

## 6. Retest

Retest выполняется для Acceptance Criteria, затронутых исправлением дефекта.

При необходимости выполняется дополнительная regression-проверка связанных сценариев `US-01–US-05`.

Результаты retest фиксируются в этом отчёте.

---

## 7. Итог

US-06 остаётся в статусе:

**🟡 BLOCKED**

Причина: реализация ещё не готова к Product Acceptance.

После передачи интегрированной версии будут выполнены:

- QA checklist;
- проверка всех обязательных Acceptance Criteria;
- проверка confirmation / cancel / success / error;
- проверка отсутствия hard delete;
- проверка cancelled-state для Teacher и Student;
- проверка persistence после refresh;
- Frontend ↔ Backend E2E;
- regression связанных сценариев;
- фиксация defects;
- retest;
- определение итогового статуса `PASS / FAIL / BLOCKED`.
