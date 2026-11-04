# US-18 — История занятий и посещаемости

## User Story

**Я как преподаватель хочу видеть по ученику историю занятий и посещаемости, чтобы понимать регулярность его обучения.**

---

## 1. Цель

Дать `Teacher` историческое представление занятий конкретного Student с фактическими статусами и attendance.

## 2. Источники данных

Используются уже сохранённые:

- `Lesson`;
- lifecycle-status Lesson;
- attendance из US-08;
- связь Teacher ↔ Student.

Статистика не должна создавать отдельные копии этих фактов как новый источник истины.

## 3. Основной пользователь

`Teacher`.

Teacher запрашивает данные только по доступному ему Student.

## 4. Отображаемые данные

Для записи истории показывается минимум:

- дата и время;
- название / предмет Lesson;
- lifecycle-status;
- attendance, если она установлена.

Дополнительно показываются агрегаты периода, например:

- количество состоявшихся занятий;
- количество посещённых;
- количество отсутствий;
- количество неотмеченных attendance.

Неотмеченное attendance не считается автоматически `absent`.

## 5. Период

Teacher может просматривать данные за выбранный диапазон.

UI явно показывает текущий период.

`date_from` и `date_to` трактуются одинаково Backend и Frontend.

## 6. Основной сценарий

1. Teacher открывает карточку Student.
2. Переходит к истории занятий / посещаемости.
3. UI отправляет выбранный период.
4. Backend проверяет Teacher ↔ Student.
5. Получает Lesson и attendance.
6. Возвращает историю и агрегаты.
7. UI отображает список / timeline и summary.
8. При смене периода данные пересчитываются.

## 7. Внешний контракт

```text
GET /api/v1/teachers/me/students/{student_id}/lesson-history
```

Query:

```text
?date_from=...&date_to=...
```

Response содержит историю и однозначные агрегаты либо DTO, из которого агрегаты рассчитываются без расхождений.

## 8. Правила расчёта

- cancelled Lesson не считается посещённым;
- отсутствие attendance не равно `absent`;
- один Lesson учитывается один раз;
- агрегаты соответствуют тем же строкам истории за тот же период;
- timezone не должна переносить Lesson в неверный пользовательский день.

## 9. Empty / Loading / Error

Пустой период является корректным empty state.

Ошибка загрузки не отображается как «0 занятий».

## 10. Boundary cases

- нет Lesson;
- только cancelled Lesson;
- completed без attendance;
- present;
- absent;
- Lesson ровно на границе периода;
- Student недоступен Teacher.

## 11. Зависимости

- US-01–US-09;
- особенно US-07 и US-08;
- [`../../general/progress-statistics.md`](../../general/progress-statistics.md).

## 12. Out of Scope

- финансовая история;
- причины пропуска;
- экспорт календаря;
- прогноз посещаемости.

## 13. Пользовательский результат

Teacher получает объяснимую историю занятий Student и может оценить регулярность обучения по фактическим данным.

---

## 14. Product Acceptance coverage

Поведение этой User Story принимается только после проверки всех критериев из [`acceptance-criteria.md`](./acceptance-criteria.md). Для US-18 определены **10 независимых AC**, покрывающих happy path, authorization, validation, lifecycle, negative/error states, согласованность Backend/Frontend и применимые edge/concurrency cases.

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
