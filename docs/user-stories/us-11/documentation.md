# US-11 — Просмотр домашних заданий учеником

## User Story

**Я как ученик хочу видеть назначенные мне домашние задания и сроки их выполнения, чтобы планировать самостоятельную работу.**

---

## 1. Цель

Позволить аутентифицированному `Student` увидеть собственные Homework и понять, какие задания требуют действий.

## 2. Основной пользователь

`Student`.

## 3. Правила доступа

Backend определяет текущего Student из authentication context.

Student не передаёт произвольный `student_id` для получения чужих Homework.

В список входят только задания, назначенные текущему Student.

## 4. Отображаемые данные

Для каждого Homework показывается минимум:

- название;
- Teacher;
- `due_at`;
- актуальный lifecycle-status;
- признак просроченности, если применимо.

В деталях дополнительно доступны:

- описание;
- материалы Teacher;
- информация об актуальной попытке;
- результат проверки, если он уже существует.

Teacher отображается человекочитаемо.

## 5. Разделение заданий

Интерфейс должен позволять отличить задания, требующие внимания, от завершённых.

К активным относятся как минимум:

- `assigned`;
- `needs_revision`.

`submitted` означает, что работа отправлена и ожидает действий Teacher.

`reviewed` означает завершённый цикл текущей версии Homework.

`overdue` является признаком, а не самостоятельным lifecycle-status.

## 6. Основной сценарий

1. Student открывает раздел Homework.
2. UI запрашивает задания текущего пользователя.
3. Backend ограничивает выборку текущим Student.
4. Student видит список.
5. Для каждого задания видны deadline и состояние.
6. Student открывает конкретное Homework и видит детали.
7. После возврата из деталей список отражает актуальное Backend-состояние.

## 7. Внешний контракт

Список:

```text
GET /api/v1/students/me/homework
```

Допустимы базовые фильтры:

```text
?state=active
?state=completed
```

Детали:

```text
GET /api/v1/students/me/homework/{homework_id}
```

Backend проверяет принадлежность Homework текущему Student.

## 8. Empty / Loading / Error

### Empty

Если Homework нет, отображается отдельный empty state.

### Loading

Список не должен показываться как пустой до завершения загрузки.

### Error

Backend / transport error отличим от empty state и позволяет повторить запрос.

## 9. Boundary cases

- нет ни одного Homework;
- есть только reviewed Homework;
- несколько заданий с одинаковым deadline;
- deadline уже наступил;
- Homework в `submitted`;
- Homework в `needs_revision`;
- неизвестное значение status.

Неизвестный status не должен приводить к падению интерфейса.

## 10. Зависимости

- US-10;
- authentication Student;
- [`../../general/homework.md`](../../general/homework.md).

## 11. Out of Scope

Student в рамках US-11 не может:

- создавать Homework;
- изменять deadline;
- менять Teacher;
- удалять задание;
- видеть Homework другого Student.

## 12. Пользовательский результат

Student получает единое представление назначенной самостоятельной работы и понимает, что нужно выполнить, к какому сроку и в каком состоянии находится каждое задание.

---

## 14. Product Acceptance coverage

Поведение этой User Story принимается только после проверки всех критериев из [`acceptance-criteria.md`](./acceptance-criteria.md). Для US-11 определены **10 независимых AC**, покрывающих happy path, authorization, validation, lifecycle, negative/error states, согласованность Backend/Frontend и применимые edge/concurrency cases.

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
