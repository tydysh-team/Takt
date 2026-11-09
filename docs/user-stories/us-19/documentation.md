# US-19 — Статистика выполнения домашних заданий

## User Story

**Я как преподаватель хочу видеть статистику выполнения домашних заданий ученика, чтобы понимать его дисциплину и учебную активность.**

---

## 1. Цель

Дать `Teacher` агрегированное представление выполнения Homework конкретного Student за выбранный период.

## 2. Источники

Используются:

- Homework;
- `due_at`;
- Submission Attempt;
- late-признаки;
- решения `needs_revision`;
- review results.

## 3. Показатели

Система должна позволять показать минимум:

- назначено Homework;
- отправлено;
- проверено;
- просрочено;
- количество / долю Homework, возвращавшихся на доработку.

Процентные показатели должны иметь понятный знаменатель.

При нулевом количестве Homework деление на ноль не допускается.

## 4. Основной пользователь

`Teacher`.

Teacher получает статистику только по доступному Student.

## 5. Период

Расчёт выполняется за явно выбранный период.

Для каждого показателя должно быть однозначно определено, по какой дате объект попадает в период.

Базовое правило для объёма назначений — дата создания / назначения Homework.

Для late и submission-related показателей используются фактические данные соответствующих Homework и попыток.

Если команда выбирает другую семантику периода, она должна быть единой для Backend, Frontend и Student view.

## 6. Основной сценарий

1. Teacher открывает Student.
2. Выбирает статистику Homework.
3. UI передаёт период.
4. Backend проверяет доступ.
5. Агрегирует Homework / submissions.
6. Возвращает показатели.
7. UI показывает карточки метрик.
8. Teacher может перейти к исходным Homework.

## 7. Внешний контракт

```text
GET /api/v1/teachers/me/students/{student_id}/homework-statistics
```

Query:

```text
?date_from=...&date_to=...
```

Пример response:

```json
{
  "assigned": 10,
  "submitted": 8,
  "reviewed": 7,
  "late": 2,
  "revision_required": 3
}
```

Проценты могут рассчитываться Backend либо Frontend, но формула должна быть единой и воспроизводимой.

## 8. Согласованность

Числа должны соответствовать исходным Homework за тот же период.

Переход к списку исходных заданий не должен показывать принципиально другой набор данных без понятной причины фильтрации.

## 9. Empty / Error

Если Homework нет:

- count = 0;
- процент не превращается в `NaN` / exception;
- UI показывает корректный empty/zero state.

API error отображается отдельно.

## 10. Boundary cases

- 0 Homework;
- 1 Homework;
- Homework без submission;
- late submission;
- несколько attempts;
- Homework с `needs_revision`;
- reviewed Homework;
- границы периода.

## 11. Зависимости

- US-10–US-17;
- общий homework lifecycle;
- [`../../general/progress-statistics.md`](../../general/progress-statistics.md).

## 12. Out of Scope

- прогноз выполнения;
- сравнение Students;
- рейтинг дисциплины;
- BI-dashboard.

## 13. Пользовательский результат

Teacher видит прозрачные метрики самостоятельной работы Student и может перейти от агрегата к исходным Homework.

---

## 14. Product Acceptance coverage

Поведение этой User Story принимается только после проверки всех критериев из [`acceptance-criteria.md`](./acceptance-criteria.md). Для US-19 определены **10 независимых AC**, покрывающих happy path, authorization, validation, lifecycle, negative/error states, согласованность Backend/Frontend и применимые edge/concurrency cases.

Фактические результаты фиксируются в [`acceptance-report.md`](./acceptance-report.md); до передачи реализации на QA отчёт имеет статус **🟡 BLOCKED**.

## 15. Security & authorization

- Backend является финальной точкой контроля доступа; скрытие кнопки/маршрута на Frontend не считается достаточной защитой.
- Идентификаторы из request нельзя использовать для обхода ownership.
- При отказе доступа response не должен раскрывать данные чужого Teacher/Student/Homework/Submission.

## 16. Reliability & concurrency

- Mutating action считается завершённым только после подтверждения Backend.
- Double-click, retry и конкурентная смена lifecycle не должны приводить к двойному применению одного логического действия.
- При конфликте состояния пользователь получает явный conflict/error state и должен перезагрузить актуальные данные.

## 17. Observability & performance

Для ошибок, влияющих на Product Acceptance, должны быть доступны диагностические данные Backend/Frontend (request correlation/лог ошибки или эквивалент в принятом стеке) без вывода чувствительных данных пользователю.

Performance проверяется как Sprint-ориентир, а не production SLA: интерактивные запросы — ориентир p95 ≤ 500 мс, агрегирующие статистические запросы — p95 ≤ 1000 мс на типовом тестовом объёме.

## 18. Contract alignment before merge

Перед merge документации необходимо сверить буквальные endpoint paths, DTO-поля и enum/status с фактической реализацией. При расхождении нельзя «подгонять» acceptance result: сначала синхронизируется контракт документации и кода, затем выполняется Product Acceptance.

Ссылки на общие правила:

- [`../../foundation/api-conventions.md`](../../foundation/api-conventions.md)
- [`../../foundation/domain-rules.md`](../../foundation/domain-rules.md)
